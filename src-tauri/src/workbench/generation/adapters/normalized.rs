use crate::workbench::error::CommandError;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ProviderProtocol {
    OpenAiCompatible,
    XaiImages,
    GeminiNative,
}

impl ProviderProtocol {
    pub fn parse(value: &str) -> Result<Self, CommandError> {
        match value {
            "openai_compatible" => Ok(Self::OpenAiCompatible),
            "xai_images" => Ok(Self::XaiImages),
            "gemini_native" => Ok(Self::GeminiNative),
            _ => Err(CommandError::new(
                "provider.unsupported_protocol",
                "不支持所选 Provider 协议。",
            )),
        }
    }

    pub fn id(self) -> &'static str {
        match self {
            Self::OpenAiCompatible => "openai_compatible",
            Self::XaiImages => "xai_images",
            Self::GeminiNative => "gemini_native",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ProviderCapabilities {
    pub max_references: usize,
    pub max_results: i64,
    pub aspect_ratios: Vec<&'static str>,
    pub resolutions: Vec<&'static str>,
    pub supports_quality: bool,
    pub supports_output_format: bool,
    pub supports_output_compression: bool,
    pub supports_background: bool,
    pub supports_moderation: bool,
}

pub fn capabilities_for(protocol: ProviderProtocol, model: &str) -> ProviderCapabilities {
    match protocol {
        ProviderProtocol::OpenAiCompatible => ProviderCapabilities {
            max_references: 1,
            max_results: 4,
            aspect_ratios: vec!["1:1", "3:2", "2:3"],
            resolutions: vec!["standard", "medium", "large"],
            supports_quality: true,
            supports_output_format: true,
            supports_output_compression: true,
            supports_background: true,
            supports_moderation: true,
        },
        ProviderProtocol::XaiImages => ProviderCapabilities {
            max_references: 3,
            max_results: 4,
            aspect_ratios: vec!["1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3"],
            resolutions: vec!["standard", "medium", "large"],
            supports_quality: false,
            supports_output_format: false,
            supports_output_compression: false,
            supports_background: false,
            supports_moderation: false,
        },
        ProviderProtocol::GeminiNative => ProviderCapabilities {
            max_references: 3,
            max_results: 1,
            aspect_ratios: vec!["1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3"],
            resolutions: if model == "gemini-3-pro-image" {
                vec!["standard", "medium", "large"]
            } else {
                vec!["standard"]
            },
            supports_quality: false,
            supports_output_format: false,
            supports_output_compression: false,
            supports_background: false,
            supports_moderation: false,
        },
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NormalizedReference {
    pub filename: String,
    pub mime_type: String,
    pub bytes: Vec<u8>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct OpenAiOptions {
    pub quality: String,
    pub output_format: String,
    pub output_compression: i64,
    pub background: String,
    pub moderation: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NormalizedImageRequest {
    pub prompt: String,
    pub model: String,
    pub count: i64,
    pub aspect_ratio: String,
    pub resolution: String,
    pub size: String,
    pub references: Vec<NormalizedReference>,
    pub openai_options: OpenAiOptions,
}

#[cfg(test)]
mod tests {
    use super::{capabilities_for, ProviderProtocol};

    #[test]
    fn parses_only_explicit_built_in_protocol_ids() {
        assert_eq!(
            ProviderProtocol::parse("openai_compatible").unwrap(),
            ProviderProtocol::OpenAiCompatible
        );
        assert_eq!(
            ProviderProtocol::parse("xai_images").unwrap(),
            ProviderProtocol::XaiImages
        );
        assert_eq!(
            ProviderProtocol::parse("gemini_native").unwrap(),
            ProviderProtocol::GeminiNative
        );
        assert_eq!(
            ProviderProtocol::parse("https://api.x.ai")
                .unwrap_err()
                .code,
            "provider.unsupported_protocol"
        );
    }

    #[test]
    fn capabilities_keep_protocol_limits_explicit() {
        let openai = capabilities_for(ProviderProtocol::OpenAiCompatible, "gpt-image-2");
        assert_eq!(openai.max_references, 1);
        assert_eq!(openai.max_results, 4);
        assert!(openai.supports_quality);

        let xai = capabilities_for(ProviderProtocol::XaiImages, "grok-imagine-image-quality");
        assert_eq!(xai.max_references, 3);
        assert_eq!(xai.resolutions, vec!["standard", "medium", "large"]);
        assert!(!xai.supports_quality);

        let flash = capabilities_for(ProviderProtocol::GeminiNative, "gemini-2.5-flash-image");
        assert_eq!(flash.max_references, 3);
        assert_eq!(flash.max_results, 1);
        assert_eq!(flash.resolutions, vec!["standard"]);

        let pro = capabilities_for(ProviderProtocol::GeminiNative, "gemini-3-pro-image");
        assert_eq!(pro.resolutions, vec!["standard", "medium", "large"]);
    }
}
