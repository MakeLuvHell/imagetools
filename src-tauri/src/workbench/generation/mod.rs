use super::error::CommandError;

pub mod client;

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
    use super::{
        build_edit_fields, build_generation_payload, join_api_url, normalize_background,
        normalize_count, normalize_moderation, normalize_option, normalize_output_compression,
        normalize_output_format, normalize_quality, validate_background_for_model,
        validate_image_size, EditRequest, GenerationRequest,
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
}
