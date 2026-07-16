use std::{future::Future, path::Path, pin::Pin, sync::Arc};

use super::{
    database::providers::{ProviderRecord, ProviderRepository},
    error::CommandError,
    models::{GenerateInput, GenerateResultDto},
    sessions::{HistoryService, NewRunInput},
};
use client::{ProviderClient, ProviderResponse};
use files::{
    cleanup_file, merge_cleanup_error, ConsumedReference, ReferenceStore, ResultFileStore,
};

pub mod client;
pub mod files;

pub trait ProviderTransport: Send + Sync {
    fn generate<'a>(
        &'a self,
        request: &'a GenerationRequest,
    ) -> Pin<Box<dyn Future<Output = Result<ProviderResponse, CommandError>> + Send + 'a>>;

    fn edit<'a>(
        &'a self,
        request: &'a EditRequest,
        filename: String,
        mime_type: &'a str,
        image: Vec<u8>,
    ) -> Pin<Box<dyn Future<Output = Result<ProviderResponse, CommandError>> + Send + 'a>>;
}

pub trait ProviderFactory: Send + Sync {
    fn create(
        &self,
        base_url: &str,
        api_key: &str,
    ) -> Result<Arc<dyn ProviderTransport>, CommandError>;
}

struct DefaultProviderFactory;

impl ProviderFactory for DefaultProviderFactory {
    fn create(
        &self,
        base_url: &str,
        api_key: &str,
    ) -> Result<Arc<dyn ProviderTransport>, CommandError> {
        Ok(Arc::new(ProviderClient::new(base_url, api_key)?))
    }
}

impl ProviderTransport for ProviderClient {
    fn generate<'a>(
        &'a self,
        request: &'a GenerationRequest,
    ) -> Pin<Box<dyn Future<Output = Result<ProviderResponse, CommandError>> + Send + 'a>> {
        Box::pin(async move { ProviderClient::generate(self, request).await })
    }

    fn edit<'a>(
        &'a self,
        request: &'a EditRequest,
        filename: String,
        mime_type: &'a str,
        image: Vec<u8>,
    ) -> Pin<Box<dyn Future<Output = Result<ProviderResponse, CommandError>> + Send + 'a>> {
        Box::pin(
            async move { ProviderClient::edit(self, request, filename, mime_type, image).await },
        )
    }
}

pub struct GenerationService {
    providers: ProviderRepository,
    history: HistoryService,
    references: ReferenceStore,
    result_files: ResultFileStore,
    data_root: std::path::PathBuf,
    factory: Arc<dyn ProviderFactory>,
}

impl GenerationService {
    pub fn new(
        providers: ProviderRepository,
        history: HistoryService,
        references: ReferenceStore,
        data_root: std::path::PathBuf,
    ) -> Self {
        Self::with_factory(
            providers,
            history,
            references,
            data_root,
            Arc::new(DefaultProviderFactory),
        )
    }

    pub(crate) fn with_factory(
        providers: ProviderRepository,
        history: HistoryService,
        references: ReferenceStore,
        data_root: std::path::PathBuf,
        factory: Arc<dyn ProviderFactory>,
    ) -> Self {
        Self {
            providers,
            history,
            references,
            result_files: ResultFileStore::new(data_root.clone()),
            data_root,
            factory,
        }
    }

    pub async fn generate(&self, input: GenerateInput) -> Result<GenerateResultDto, CommandError> {
        let prompt = input.prompt.trim().to_string();
        if prompt.is_empty() {
            return Err(CommandError::new(
                "generation.prompt_required",
                "请先输入提示词。",
            ));
        }
        self.history.get_session(input.session_id)?;
        let provider = self.resolve_provider(input.provider_id)?;
        let model = if input.model.trim().is_empty() {
            provider.default_model.clone()
        } else {
            input.model.trim().to_string()
        };
        let size = validate_image_size(input.width, input.height)?;
        let count = normalize_count(input.count);
        let quality = normalize_quality(&input.quality);
        let output_format = normalize_output_format(&input.output_format);
        let output_compression = normalize_output_compression(input.output_compression);
        let background =
            validate_background_for_model(&normalize_background(&input.background), &model)?;
        let moderation = normalize_moderation(&input.moderation);
        let reference = input
            .reference_token
            .as_deref()
            .map(|token| self.references.consume(token))
            .transpose()?;
        let reference_image_path = reference
            .as_ref()
            .map(|reference| relative_data_path(&self.data_root, &reference.path))
            .transpose();
        let reference_image_path = match reference_image_path {
            Ok(path) => path,
            Err(error) => {
                let cleanup = reference
                    .as_ref()
                    .map_or(Ok(()), |reference| cleanup_file(&reference.path));
                return Err(merge_cleanup_error(error, cleanup));
            }
        };
        let kind = if reference.is_some() {
            "image_to_image"
        } else {
            "text_to_image"
        };
        let parameters = serde_json::json!({
            "width": input.width,
            "height": input.height,
            "size": size,
            "ratio": input.ratio.trim(),
            "resolution": input.resolution.trim(),
            "count": count,
            "quality": quality,
            "output_format": output_format,
            "output_compression": output_compression,
            "background": background,
            "moderation": moderation,
            "kind": kind,
        });
        let run = match self.history.create_run(NewRunInput {
            session_id: input.session_id,
            status: "running".into(),
            prompt: prompt.clone(),
            parameters,
            provider_id: Some(provider.id),
            provider_name: provider.name.clone(),
            model: model.clone(),
            reference_image_path,
            error_message: None,
        }) {
            Ok(run) => run,
            Err(error) => {
                let cleanup = reference
                    .as_ref()
                    .map_or(Ok(()), |reference| cleanup_file(&reference.path));
                return Err(merge_cleanup_error(error, cleanup));
            }
        };

        let response = self
            .request_provider(
                &provider,
                reference.as_ref(),
                &prompt,
                &model,
                &size,
                count,
                &quality,
                &output_format,
                output_compression,
                &background,
                &moderation,
            )
            .await;
        let response = match response {
            Ok(response) => response,
            Err(error) => return self.finish_failed(run.id, error),
        };
        let persisted = match self
            .result_files
            .persist(response, &output_format, input.width, input.height)
            .await
        {
            Ok(persisted) => persisted,
            Err(error) => return self.finish_failed(run.id, error),
        };
        let metadata = persisted
            .iter()
            .map(|image| image.metadata.clone())
            .collect::<Vec<_>>();
        if let Err(error) = self.history.commit_success(run.id, metadata) {
            let error = merge_cleanup_error(error, ResultFileStore::cleanup(&persisted));
            return self.finish_failed(run.id, error);
        }
        Ok(GenerateResultDto {
            kind: kind.to_string(),
            model,
            size,
            images: persisted
                .iter()
                .map(|image| format!("/files/{}", image.metadata.local_path))
                .collect(),
        })
    }

    #[allow(clippy::too_many_arguments)]
    async fn request_provider(
        &self,
        provider: &ProviderRecord,
        reference: Option<&ConsumedReference>,
        prompt: &str,
        model: &str,
        size: &str,
        count: i64,
        quality: &str,
        output_format: &str,
        output_compression: i64,
        background: &str,
        moderation: &str,
    ) -> Result<ProviderResponse, CommandError> {
        let client = self.factory.create(&provider.base_url, &provider.api_key)?;
        if let Some(reference) = reference {
            let bytes = std::fs::read(&reference.path)
                .map_err(|_| CommandError::new("reference.read_failed", "无法读取参考图。"))?;
            client
                .edit(
                    &EditRequest {
                        prompt: prompt.to_string(),
                        model: model.to_string(),
                        size: size.to_string(),
                        quality: quality.to_string(),
                        output_format: output_format.to_string(),
                        output_compression,
                        background: background.to_string(),
                    },
                    reference.original_name.clone(),
                    &reference.mime_type,
                    bytes,
                )
                .await
        } else {
            client
                .generate(&GenerationRequest {
                    prompt: prompt.to_string(),
                    model: model.to_string(),
                    size: size.to_string(),
                    count,
                    quality: quality.to_string(),
                    output_format: output_format.to_string(),
                    output_compression,
                    background: background.to_string(),
                    moderation: moderation.to_string(),
                })
                .await
        }
    }

    fn resolve_provider(&self, provider_id: Option<i64>) -> Result<ProviderRecord, CommandError> {
        let provider = if let Some(provider_id) = provider_id {
            self.providers.get(provider_id)?
        } else {
            let providers = self.providers.list()?;
            providers
                .iter()
                .find(|provider| provider.is_default)
                .cloned()
                .or_else(|| providers.into_iter().next())
        };
        provider.ok_or_else(|| CommandError::new("provider.not_found", "请先配置 Provider。"))
    }

    fn finish_failed<T>(&self, run_id: i64, error: CommandError) -> Result<T, CommandError> {
        self.history.finish_failed(run_id, &error.message)?;
        Err(error)
    }
}

fn relative_data_path(data_root: &Path, path: &Path) -> Result<String, CommandError> {
    path.strip_prefix(data_root)
        .map(|relative| relative.to_string_lossy().replace('\\', "/"))
        .map_err(|_| CommandError::new("reference.invalid_path", "参考图路径无效。"))
}

const MIN_IMAGE_PIXELS: u64 = 655_360;
const MAX_IMAGE_PIXELS: u64 = 8_294_400;
const MAX_IMAGE_EDGE: u32 = 3840;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GenerationRequest {
    pub prompt: String,
    pub model: String,
    pub size: String,
    pub count: i64,
    pub quality: String,
    pub output_format: String,
    pub output_compression: i64,
    pub background: String,
    pub moderation: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct EditRequest {
    pub prompt: String,
    pub model: String,
    pub size: String,
    pub quality: String,
    pub output_format: String,
    pub output_compression: i64,
    pub background: String,
}

pub fn validate_image_size(width: i64, height: i64) -> Result<String, CommandError> {
    if width <= 0 || height <= 0 {
        return Err(invalid_size("图片尺寸必须大于 0。"));
    }
    if width % 16 != 0 || height % 16 != 0 {
        return Err(invalid_size("图片宽高必须是 16 的倍数。"));
    }

    let width = u32::try_from(width).map_err(|_| invalid_size("图片最长边不能超过 3840px。"))?;
    let height = u32::try_from(height).map_err(|_| invalid_size("图片最长边不能超过 3840px。"))?;
    let longest = width.max(height);
    let shortest = width.min(height);
    if longest > MAX_IMAGE_EDGE {
        return Err(invalid_size("图片最长边不能超过 3840px。"));
    }
    if u64::from(longest) > u64::from(shortest) * 3 {
        return Err(invalid_size("图片长短边比例不能超过 3:1。"));
    }

    let pixels = u64::from(width) * u64::from(height);
    if !(MIN_IMAGE_PIXELS..=MAX_IMAGE_PIXELS).contains(&pixels) {
        return Err(invalid_size("图片总像素必须在 655,360 到 8,294,400 之间。"));
    }

    Ok(format!("{width}x{height}"))
}

pub fn normalize_count(count: i64) -> i64 {
    count.clamp(1, 4)
}

pub fn normalize_option(value: &str, allowed: &[&str], fallback: &str) -> String {
    let clean = value.trim();
    if allowed.contains(&clean) {
        clean.to_string()
    } else {
        fallback.to_string()
    }
}

pub fn normalize_quality(value: &str) -> String {
    normalize_option(value, &["auto", "low", "medium", "high"], "auto")
}

pub fn normalize_output_format(value: &str) -> String {
    normalize_option(value, &["png", "jpeg", "webp"], "png")
}

pub fn normalize_background(value: &str) -> String {
    normalize_option(value, &["auto", "opaque", "transparent"], "auto")
}

pub fn normalize_moderation(value: &str) -> String {
    normalize_option(value, &["auto", "low"], "auto")
}

pub fn normalize_output_compression(value: i64) -> i64 {
    value.clamp(0, 100)
}

pub fn validate_background_for_model(
    background: &str,
    model: &str,
) -> Result<String, CommandError> {
    if background == "transparent" && model.to_lowercase().contains("gpt-image-2") {
        return Err(CommandError::new(
            "generation.unsupported_background",
            "gpt-image-2 不支持透明背景。请选择“自动”或“不透明”。",
        ));
    }
    Ok(background.to_string())
}

pub fn join_api_url(base_url: &str, path: &str) -> String {
    let clean_base = base_url.trim_end_matches('/');
    let clean_path = if path.starts_with('/') {
        path.to_string()
    } else {
        format!("/{path}")
    };
    if clean_base.ends_with("/v1") && clean_path.starts_with("/v1/") {
        format!("{clean_base}{}", &clean_path[3..])
    } else {
        format!("{clean_base}{clean_path}")
    }
}

pub fn build_generation_payload(request: &GenerationRequest) -> serde_json::Value {
    let mut payload = serde_json::Map::from_iter([
        ("prompt".into(), request.prompt.clone().into()),
        ("model".into(), request.model.clone().into()),
        ("size".into(), request.size.clone().into()),
        ("n".into(), request.count.into()),
        ("output_format".into(), request.output_format.clone().into()),
    ]);
    if request.quality != "auto" {
        payload.insert("quality".into(), request.quality.clone().into());
    }
    if matches!(request.output_format.as_str(), "jpeg" | "webp") {
        payload.insert(
            "output_compression".into(),
            request.output_compression.into(),
        );
    }
    if request.background != "auto" {
        payload.insert("background".into(), request.background.clone().into());
    }
    if request.moderation != "auto" {
        payload.insert("moderation".into(), request.moderation.clone().into());
    }
    serde_json::Value::Object(payload)
}

pub fn build_edit_fields(request: &EditRequest) -> Vec<(String, String)> {
    let mut fields = vec![
        ("prompt".into(), request.prompt.clone()),
        ("model".into(), request.model.clone()),
        ("size".into(), request.size.clone()),
    ];
    if request.quality != "auto" {
        fields.push(("quality".into(), request.quality.clone()));
    }
    fields.push(("output_format".into(), request.output_format.clone()));
    if matches!(request.output_format.as_str(), "jpeg" | "webp") {
        fields.push((
            "output_compression".into(),
            request.output_compression.to_string(),
        ));
    }
    if request.background != "auto" {
        fields.push(("background".into(), request.background.clone()));
    }
    fields
}

fn invalid_size(message: &'static str) -> CommandError {
    CommandError::new("generation.invalid_size", message)
}

#[cfg(test)]
mod tests {
    use std::{
        future::Future,
        pin::Pin,
        sync::{Arc, Mutex},
    };

    use base64::{engine::general_purpose::STANDARD, Engine};

    use super::{
        build_edit_fields, build_generation_payload, join_api_url, normalize_background,
        normalize_count, normalize_moderation, normalize_option, normalize_output_compression,
        normalize_output_format, normalize_quality, validate_background_for_model,
        validate_image_size, EditRequest, GenerationRequest, GenerationService, ProviderFactory,
        ProviderTransport,
    };
    use crate::workbench::{
        database::{history::HistoryRepository, providers::ProviderRepository, Database},
        error::CommandError,
        generation::{
            client::{ProviderImage, ProviderResponse},
            files::ReferenceStore,
        },
        models::{GenerateInput, ProviderInput, SessionCreateInput},
        providers::ProviderService,
        sessions::HistoryService,
    };

    fn generation_request() -> GenerationRequest {
        GenerationRequest {
            prompt: "产品图".into(),
            model: "gpt-image-2".into(),
            size: "1536x864".into(),
            count: 2,
            quality: "high".into(),
            output_format: "webp".into(),
            output_compression: 72,
            background: "opaque".into(),
            moderation: "low".into(),
        }
    }

    #[test]
    fn validates_the_existing_1536_by_864_contract() {
        assert_eq!(validate_image_size(1536, 864).unwrap(), "1536x864");
        assert_eq!(normalize_count(0), 1);
        assert_eq!(normalize_count(9), 4);
    }

    #[test]
    fn rejects_each_invalid_dimension_boundary_with_python_messages() {
        let cases = [
            ((0, 864), "图片尺寸必须大于 0。"),
            ((1537, 864), "图片宽高必须是 16 的倍数。"),
            ((3840, 2560), "图片总像素必须在 655,360 到 8,294,400 之间。"),
            ((3856, 1280), "图片最长边不能超过 3840px。"),
            ((3072, 1008), "图片长短边比例不能超过 3:1。"),
            ((800, 800), "图片总像素必须在 655,360 到 8,294,400 之间。"),
            ((2896, 2896), "图片总像素必须在 655,360 到 8,294,400 之间。"),
        ];

        for ((width, height), expected) in cases {
            assert_eq!(
                validate_image_size(width, height).unwrap_err().message,
                expected
            );
        }
    }

    #[test]
    fn normalizes_supported_options_and_rejects_gpt_image_2_transparency() {
        assert_eq!(
            normalize_option(" high ", &["auto", "high"], "auto"),
            "high"
        );
        assert_eq!(normalize_option("ultra", &["auto", "high"], "auto"), "auto");
        assert_eq!(
            validate_background_for_model("transparent", "GPT-IMAGE-2")
                .unwrap_err()
                .message,
            "gpt-image-2 不支持透明背景。请选择“自动”或“不透明”。"
        );
        assert_eq!(
            validate_background_for_model("transparent", "gpt-image-1").unwrap(),
            "transparent"
        );
    }

    #[test]
    fn normalizes_each_generation_option_with_python_fallbacks() {
        assert_eq!(normalize_quality(" medium "), "medium");
        assert_eq!(normalize_quality("ultra"), "auto");
        assert_eq!(normalize_output_format("jpeg"), "jpeg");
        assert_eq!(normalize_output_format("jpg"), "png");
        assert_eq!(normalize_background("transparent"), "transparent");
        assert_eq!(normalize_background("clear"), "auto");
        assert_eq!(normalize_moderation("low"), "low");
        assert_eq!(normalize_moderation("high"), "auto");
        assert_eq!(normalize_output_compression(-1), 0);
        assert_eq!(normalize_output_compression(101), 100);
    }

    #[test]
    fn avoids_a_duplicate_v1_segment() {
        assert_eq!(
            join_api_url("https://api.example.com/v1", "/v1/images/generations"),
            "https://api.example.com/v1/images/generations"
        );
        assert_eq!(
            join_api_url("https://api.example.com/", "v1/images/edits"),
            "https://api.example.com/v1/images/edits"
        );
    }

    #[test]
    fn generation_payload_matches_python_field_rules() {
        let payload = build_generation_payload(&generation_request());

        assert_eq!(
            payload,
            serde_json::json!({
                "prompt": "产品图",
                "model": "gpt-image-2",
                "size": "1536x864",
                "n": 2,
                "quality": "high",
                "output_format": "webp",
                "output_compression": 72,
                "background": "opaque",
                "moderation": "low"
            })
        );
    }

    #[test]
    fn generation_payload_omits_auto_and_png_compression_fields() {
        let mut request = generation_request();
        request.quality = "auto".into();
        request.output_format = "png".into();
        request.background = "auto".into();
        request.moderation = "auto".into();

        let payload = build_generation_payload(&request);

        assert_eq!(
            payload,
            serde_json::json!({
                "prompt": "产品图",
                "model": "gpt-image-2",
                "size": "1536x864",
                "n": 2,
                "output_format": "png"
            })
        );
    }

    #[test]
    fn edit_fields_follow_generation_omission_rules() {
        let fields = build_edit_fields(&EditRequest {
            prompt: "修改产品图".into(),
            model: "gpt-image-1".into(),
            size: "1024x1024".into(),
            quality: "auto".into(),
            output_format: "jpeg".into(),
            output_compression: 80,
            background: "auto".into(),
        });

        assert_eq!(
            fields,
            vec![
                ("prompt".into(), "修改产品图".into()),
                ("model".into(), "gpt-image-1".into()),
                ("size".into(), "1024x1024".into()),
                ("output_format".into(), "jpeg".into()),
                ("output_compression".into(), "80".into()),
            ]
        );
    }

    #[derive(Debug, Clone, PartialEq, Eq)]
    enum FakeCall {
        Generate(GenerationRequest),
        Edit(EditRequest, String, String, Vec<u8>),
    }

    struct FakeState {
        response: Result<ProviderResponse, CommandError>,
        calls: Mutex<Vec<FakeCall>>,
        configurations: Mutex<Vec<(String, String)>>,
    }

    #[derive(Clone)]
    struct FakeFactory(Arc<FakeState>);

    struct FakeTransport(Arc<FakeState>);

    struct DelayedFactory {
        entered: Arc<tokio::sync::Notify>,
        release: Arc<tokio::sync::Notify>,
        response: ProviderResponse,
    }

    struct DelayedTransport {
        entered: Arc<tokio::sync::Notify>,
        release: Arc<tokio::sync::Notify>,
        response: ProviderResponse,
    }

    struct RejectingFactory;

    struct DeletingReferenceFactory {
        upload_dir: std::path::PathBuf,
        transport: Arc<dyn ProviderTransport>,
    }

    impl ProviderFactory for FakeFactory {
        fn create(
            &self,
            base_url: &str,
            api_key: &str,
        ) -> Result<Arc<dyn ProviderTransport>, CommandError> {
            self.0
                .configurations
                .lock()
                .unwrap()
                .push((base_url.to_string(), api_key.to_string()));
            Ok(Arc::new(FakeTransport(self.0.clone())))
        }
    }

    impl ProviderTransport for FakeTransport {
        fn generate<'a>(
            &'a self,
            request: &'a GenerationRequest,
        ) -> Pin<Box<dyn Future<Output = Result<ProviderResponse, CommandError>> + Send + 'a>>
        {
            self.0
                .calls
                .lock()
                .unwrap()
                .push(FakeCall::Generate(request.clone()));
            let response = self.0.response.clone();
            Box::pin(async move { response })
        }

        fn edit<'a>(
            &'a self,
            request: &'a EditRequest,
            filename: String,
            mime_type: &'a str,
            image: Vec<u8>,
        ) -> Pin<Box<dyn Future<Output = Result<ProviderResponse, CommandError>> + Send + 'a>>
        {
            self.0.calls.lock().unwrap().push(FakeCall::Edit(
                request.clone(),
                filename,
                mime_type.to_string(),
                image,
            ));
            let response = self.0.response.clone();
            Box::pin(async move { response })
        }
    }

    impl ProviderFactory for DelayedFactory {
        fn create(
            &self,
            _base_url: &str,
            _api_key: &str,
        ) -> Result<Arc<dyn ProviderTransport>, CommandError> {
            Ok(Arc::new(DelayedTransport {
                entered: self.entered.clone(),
                release: self.release.clone(),
                response: self.response.clone(),
            }))
        }
    }

    impl ProviderFactory for RejectingFactory {
        fn create(
            &self,
            _base_url: &str,
            _api_key: &str,
        ) -> Result<Arc<dyn ProviderTransport>, CommandError> {
            Err(CommandError::new(
                "provider.connect_failed",
                "无法初始化接口连接。",
            ))
        }
    }

    impl ProviderFactory for DeletingReferenceFactory {
        fn create(
            &self,
            _base_url: &str,
            _api_key: &str,
        ) -> Result<Arc<dyn ProviderTransport>, CommandError> {
            for entry in std::fs::read_dir(&self.upload_dir).unwrap() {
                let entry = entry.unwrap();
                if entry.file_type().unwrap().is_file() {
                    std::fs::remove_file(entry.path()).unwrap();
                }
            }
            Ok(self.transport.clone())
        }
    }

    impl ProviderTransport for DelayedTransport {
        fn generate<'a>(
            &'a self,
            _request: &'a GenerationRequest,
        ) -> Pin<Box<dyn Future<Output = Result<ProviderResponse, CommandError>> + Send + 'a>>
        {
            Box::pin(async move {
                self.entered.notify_one();
                self.release.notified().await;
                Ok(self.response.clone())
            })
        }

        fn edit<'a>(
            &'a self,
            _request: &'a EditRequest,
            _filename: String,
            _mime_type: &'a str,
            _image: Vec<u8>,
        ) -> Pin<Box<dyn Future<Output = Result<ProviderResponse, CommandError>> + Send + 'a>>
        {
            Box::pin(async move {
                self.entered.notify_one();
                self.release.notified().await;
                Ok(self.response.clone())
            })
        }
    }

    struct GenerationFixture {
        _temporary: tempfile::TempDir,
        data_root: std::path::PathBuf,
        database: Arc<Database>,
        history: HistoryService,
        references: ReferenceStore,
        fake: Arc<FakeState>,
        provider_id: i64,
        session_id: i64,
    }

    impl GenerationFixture {
        fn new(response: Result<ProviderResponse, CommandError>) -> Self {
            let temporary = tempfile::tempdir().unwrap();
            let data_root = temporary.path().join("data");
            std::fs::create_dir_all(&data_root).unwrap();
            let database = Arc::new(Database::open(&data_root.join("workbench.sqlite3")).unwrap());
            let providers = ProviderRepository::new(database.clone());
            let provider_service = ProviderService::new(providers, data_root.join("settings.json"));
            let provider_id = provider_service
                .create(ProviderInput {
                    name: "Primary".into(),
                    base_url: "https://provider.example/v1".into(),
                    api_key: "sk-private".into(),
                    default_model: "gpt-image-2".into(),
                    is_default: true,
                })
                .unwrap()
                .id;
            let history = HistoryService::new(HistoryRepository::new(database.clone()));
            let session_id = history
                .create_session(SessionCreateInput {
                    title: "产品海报".into(),
                })
                .unwrap()
                .id;
            let references = ReferenceStore::new(data_root.join("uploads")).unwrap();
            Self {
                _temporary: temporary,
                data_root,
                database,
                history,
                references,
                fake: Arc::new(FakeState {
                    response,
                    calls: Mutex::new(Vec::new()),
                    configurations: Mutex::new(Vec::new()),
                }),
                provider_id,
                session_id,
            }
        }

        fn service(&self) -> GenerationService {
            GenerationService::with_factory(
                ProviderRepository::new(self.database.clone()),
                self.history.clone(),
                self.references.clone(),
                self.data_root.clone(),
                Arc::new(FakeFactory(self.fake.clone())),
            )
        }

        fn service_with_factory(&self, factory: Arc<dyn ProviderFactory>) -> GenerationService {
            GenerationService::with_factory(
                ProviderRepository::new(self.database.clone()),
                self.history.clone(),
                self.references.clone(),
                self.data_root.clone(),
                factory,
            )
        }

        fn input(&self) -> GenerateInput {
            GenerateInput {
                session_id: self.session_id,
                provider_id: Some(self.provider_id),
                prompt: "  A clean product poster  ".into(),
                model: String::new(),
                width: 1536,
                height: 864,
                ratio: " 16:9 ".into(),
                resolution: " standard ".into(),
                count: 2,
                quality: "high".into(),
                output_format: "png".into(),
                output_compression: 85,
                background: "opaque".into(),
                moderation: "low".into(),
                reference_token: None,
            }
        }
    }

    fn image_response(bytes: &[u8]) -> Result<ProviderResponse, CommandError> {
        let mut image = b"\x89PNG\r\n\x1a\n".to_vec();
        image.extend_from_slice(bytes);
        Ok(ProviderResponse {
            data: vec![ProviderImage {
                b64_json: Some(STANDARD.encode(image)),
                url: None,
            }],
        })
    }

    #[tokio::test]
    async fn text_generation_persists_snapshots_images_and_thumbnail() {
        let fixture = GenerationFixture::new(image_response(b"generated-image"));

        let result = fixture.service().generate(fixture.input()).await.unwrap();

        assert_eq!(result.kind, "text_to_image");
        assert_eq!(result.model, "gpt-image-2");
        assert_eq!(result.size, "1536x864");
        assert_eq!(result.images.len(), 1);
        let runs = fixture.history.list_runs(fixture.session_id).unwrap();
        assert_eq!(runs.len(), 1);
        assert_eq!(runs[0].status, "succeeded");
        assert_eq!(runs[0].prompt, "A clean product poster");
        assert_eq!(runs[0].provider_id, Some(fixture.provider_id));
        assert_eq!(runs[0].provider_name, "Primary");
        assert_eq!(runs[0].model, "gpt-image-2");
        assert_eq!(
            runs[0].parameters,
            serde_json::json!({
                "width": 1536,
                "height": 864,
                "size": "1536x864",
                "ratio": "16:9",
                "resolution": "standard",
                "count": 2,
                "quality": "high",
                "output_format": "png",
                "output_compression": 85,
                "background": "opaque",
                "moderation": "low",
                "kind": "text_to_image"
            })
        );
        assert_eq!(runs[0].images.len(), 1);
        assert_eq!(
            std::fs::read(fixture.data_root.join(&runs[0].images[0].local_path)).unwrap(),
            b"\x89PNG\r\n\x1a\ngenerated-image"
        );
        assert_eq!(
            fixture
                .history
                .get_session(fixture.session_id)
                .unwrap()
                .recent_thumbnail_path,
            Some(runs[0].images[0].local_path.clone())
        );
        assert_eq!(
            *fixture.fake.configurations.lock().unwrap(),
            [("https://provider.example/v1".into(), "sk-private".into())]
        );
        assert!(matches!(
            fixture.fake.calls.lock().unwrap().as_slice(),
            [FakeCall::Generate(_)]
        ));
    }

    #[test]
    fn generation_future_is_send_so_database_guards_cannot_cross_awaits() {
        fn assert_send<T: Send>(_: T) {}
        let fixture = GenerationFixture::new(image_response(b"generated-image"));
        let service = fixture.service();

        assert_send(service.generate(fixture.input()));
    }

    #[tokio::test]
    async fn reference_generation_consumes_the_token_and_uses_edit() {
        const PNG: &[u8] = b"\x89PNG\r\n\x1a\nreference";
        let fixture = GenerationFixture::new(image_response(b"edited-image"));
        let staged = fixture
            .references
            .stage("参考图.png", "image/png", PNG)
            .unwrap();
        let mut input = fixture.input();
        input.reference_token = Some(staged.token.clone());

        let result = fixture.service().generate(input).await.unwrap();

        assert_eq!(result.kind, "image_to_image");
        let run = &fixture.history.list_runs(fixture.session_id).unwrap()[0];
        assert!(run
            .reference_image_path
            .as_deref()
            .unwrap()
            .starts_with("uploads/ref_"));
        assert_eq!(
            fixture.references.consume(&staged.token).unwrap_err().code,
            "reference.not_found"
        );
        let calls = fixture.fake.calls.lock().unwrap();
        let [FakeCall::Edit(request, filename, mime_type, bytes)] = calls.as_slice() else {
            panic!("expected exactly one edit request");
        };
        assert_eq!(request.prompt, "A clean product poster");
        assert_eq!(filename, "参考图.png");
        assert_eq!(mime_type, "image/png");
        assert_eq!(bytes, PNG);
    }

    #[tokio::test]
    async fn upstream_failure_finishes_the_running_row() {
        let fixture = GenerationFixture::new(Err(CommandError::new(
            "provider.http_error",
            "接口返回错误 502。",
        )));

        let error = fixture
            .service()
            .generate(fixture.input())
            .await
            .unwrap_err();

        assert_eq!(error.code, "provider.http_error");
        let runs = fixture.history.list_runs(fixture.session_id).unwrap();
        assert_eq!(runs.len(), 1);
        assert_eq!(runs[0].status, "failed");
        assert_eq!(runs[0].error_message.as_deref(), Some("接口返回错误 502。"));
        assert!(runs[0].images.is_empty());
    }

    #[tokio::test]
    async fn factory_and_reference_read_failures_finish_created_runs() {
        let factory_fixture = GenerationFixture::new(image_response(b"unused"));
        let error = factory_fixture
            .service_with_factory(Arc::new(RejectingFactory))
            .generate(factory_fixture.input())
            .await
            .unwrap_err();
        assert_eq!(error.code, "provider.connect_failed");
        assert_eq!(
            factory_fixture
                .history
                .list_runs(factory_fixture.session_id)
                .unwrap()[0]
                .status,
            "failed"
        );

        let reference_fixture = GenerationFixture::new(image_response(b"unused"));
        let staged = reference_fixture
            .references
            .stage("reference.png", "image/png", b"\x89PNG\r\n\x1a\nreference")
            .unwrap();
        let mut input = reference_fixture.input();
        input.reference_token = Some(staged.token);
        let transport: Arc<dyn ProviderTransport> =
            Arc::new(FakeTransport(reference_fixture.fake.clone()));
        let error = reference_fixture
            .service_with_factory(Arc::new(DeletingReferenceFactory {
                upload_dir: reference_fixture.data_root.join("uploads"),
                transport,
            }))
            .generate(input)
            .await
            .unwrap_err();
        assert_eq!(error.code, "reference.read_failed");
        assert_eq!(
            reference_fixture
                .history
                .list_runs(reference_fixture.session_id)
                .unwrap()[0]
                .status,
            "failed"
        );
    }

    #[tokio::test]
    async fn default_provider_resolves_and_missing_provider_creates_no_run() {
        let default_fixture = GenerationFixture::new(image_response(b"default"));
        let mut input = default_fixture.input();
        input.provider_id = None;
        default_fixture.service().generate(input).await.unwrap();
        assert_eq!(
            default_fixture
                .history
                .list_runs(default_fixture.session_id)
                .unwrap()[0]
                .provider_id,
            Some(default_fixture.provider_id)
        );

        let missing_fixture = GenerationFixture::new(image_response(b"unused"));
        let mut input = missing_fixture.input();
        input.provider_id = Some(999_999);
        let error = missing_fixture.service().generate(input).await.unwrap_err();
        assert_eq!(error.code, "provider.not_found");
        assert!(missing_fixture
            .history
            .list_runs(missing_fixture.session_id)
            .unwrap()
            .is_empty());
    }

    #[tokio::test]
    async fn create_run_failure_cleans_the_consumed_reference_file() {
        let fixture = GenerationFixture::new(image_response(b"unused"));
        let staged = fixture
            .references
            .stage("reference.png", "image/png", b"\x89PNG\r\n\x1a\nreference")
            .unwrap();
        fixture
            .database
            .with_connection(|connection| {
                connection
                    .execute_batch(
                        "CREATE TRIGGER reject_generation_run BEFORE INSERT ON generation_runs
                         BEGIN SELECT RAISE(ABORT, 'reject run'); END;",
                    )
                    .map_err(crate::workbench::database::schema::database_error)
            })
            .unwrap();
        let mut input = fixture.input();
        input.reference_token = Some(staged.token);

        let error = fixture.service().generate(input).await.unwrap_err();

        assert_eq!(error.code, "database.query_failed");
        assert!(std::fs::read_dir(fixture.data_root.join("uploads"))
            .unwrap()
            .all(|entry| entry.unwrap().file_name() == ".staging"));
    }

    #[tokio::test]
    async fn disk_failure_finishes_the_running_row_without_temporary_files() {
        let fixture = GenerationFixture::new(image_response(b"generated-image"));
        std::fs::write(fixture.data_root.join("images"), b"not a directory").unwrap();

        let error = fixture
            .service()
            .generate(fixture.input())
            .await
            .unwrap_err();

        assert_eq!(error.code, "generation.file_write_failed");
        let runs = fixture.history.list_runs(fixture.session_id).unwrap();
        assert_eq!(runs[0].status, "failed");
        assert!(runs[0].images.is_empty());
        assert!(std::fs::read_dir(&fixture.data_root)
            .unwrap()
            .all(|entry| !entry
                .unwrap()
                .file_name()
                .to_string_lossy()
                .starts_with('.')));
    }

    #[tokio::test]
    async fn completion_failure_deletes_durable_files_and_finishes_the_run() {
        let fixture = GenerationFixture::new(image_response(b"generated-image"));
        fixture
            .database
            .with_connection(|connection| {
                connection
                    .execute_batch(
                        "CREATE TRIGGER reject_generated_images BEFORE INSERT ON images
                 BEGIN SELECT RAISE(ABORT, 'test completion failure'); END;",
                    )
                    .map_err(crate::workbench::database::schema::database_error)
            })
            .unwrap();

        let error = fixture
            .service()
            .generate(fixture.input())
            .await
            .unwrap_err();

        assert_eq!(error.code, "database.query_failed");
        let runs = fixture.history.list_runs(fixture.session_id).unwrap();
        assert_eq!(runs[0].status, "failed");
        assert!(runs[0].images.is_empty());
        assert!(std::fs::read_dir(fixture.data_root.join("images"))
            .unwrap()
            .next()
            .is_none());
    }

    #[tokio::test]
    async fn post_commit_projection_failure_does_not_undo_a_succeeded_generation() {
        let fixture = GenerationFixture::new(image_response(b"generated-image"));
        fixture
            .database
            .with_connection(|connection| {
                connection
                    .execute_batch(
                        "CREATE TRIGGER corrupt_projection_after_image AFTER INSERT ON images
                         BEGIN
                           UPDATE generation_runs SET parameters_json = '{broken'
                           WHERE id = NEW.generation_run_id;
                         END;",
                    )
                    .map_err(crate::workbench::database::schema::database_error)
            })
            .unwrap();

        let result = fixture.service().generate(fixture.input()).await.unwrap();

        assert_eq!(result.images.len(), 1);
        fixture
            .database
            .with_connection(|connection| {
                let (status, image_count): (String, i64) = connection
                    .query_row(
                        "SELECT generation_runs.status, COUNT(images.id)
                         FROM generation_runs
                         LEFT JOIN images ON images.generation_run_id = generation_runs.id
                         GROUP BY generation_runs.id",
                        [],
                        |row| Ok((row.get(0)?, row.get(1)?)),
                    )
                    .map_err(crate::workbench::database::schema::database_error)?;
                assert_eq!(status, "succeeded");
                assert_eq!(image_count, 1);
                Ok(())
            })
            .unwrap();
        assert_eq!(
            std::fs::read_dir(fixture.data_root.join("images"))
                .unwrap()
                .count(),
            1
        );
    }

    #[tokio::test]
    async fn deleting_session_during_upstream_await_prevents_hidden_success() {
        let fixture = GenerationFixture::new(image_response(b"unused"));
        let entered = Arc::new(tokio::sync::Notify::new());
        let release = Arc::new(tokio::sync::Notify::new());
        let response = image_response(b"delayed").unwrap();
        let service = fixture.service_with_factory(Arc::new(DelayedFactory {
            entered: entered.clone(),
            release: release.clone(),
            response,
        }));
        let input = fixture.input();
        let generation = tokio::spawn(async move { service.generate(input).await });
        entered.notified().await;

        fixture.history.delete_session(fixture.session_id).unwrap();
        release.notify_one();
        let error = generation.await.unwrap().unwrap_err();

        assert_eq!(error.code, "session.not_found");
        fixture
            .database
            .with_connection(|connection| {
                let (status, image_count, thumbnail): (String, i64, Option<String>) = connection
                    .query_row(
                        "SELECT generation_runs.status, COUNT(images.id), sessions.recent_thumbnail_path
                         FROM generation_runs
                         JOIN sessions ON sessions.id = generation_runs.session_id
                         LEFT JOIN images ON images.generation_run_id = generation_runs.id
                         GROUP BY generation_runs.id",
                        [],
                        |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
                    )
                    .map_err(crate::workbench::database::schema::database_error)?;
                assert_eq!(status, "failed");
                assert_eq!(image_count, 0);
                assert_eq!(thumbnail, None);
                Ok(())
            })
            .unwrap();
        assert!(std::fs::read_dir(fixture.data_root.join("images"))
            .unwrap()
            .next()
            .is_none());
    }
}
