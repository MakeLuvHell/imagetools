pub mod gemini;
pub mod normalized;
pub mod openai;
pub mod xai;

use std::sync::Arc;

use crate::workbench::error::CommandError;

use self::{
    gemini::GeminiAdapter, normalized::ProviderProtocol, openai::OpenAiAdapter, xai::XaiAdapter,
};
use super::ProviderTransport;

pub fn create_transport(
    protocol: &str,
    base_url: &str,
    api_key: &str,
) -> Result<Arc<dyn ProviderTransport>, CommandError> {
    match ProviderProtocol::parse(protocol)? {
        ProviderProtocol::OpenAiCompatible => Ok(Arc::new(OpenAiAdapter::new(base_url, api_key)?)),
        ProviderProtocol::XaiImages => Ok(Arc::new(XaiAdapter::new(base_url, api_key)?)),
        ProviderProtocol::GeminiNative => Ok(Arc::new(GeminiAdapter::new(base_url, api_key)?)),
    }
}

#[cfg(test)]
mod tests {
    use super::create_transport;

    #[test]
    fn registry_creates_the_xai_adapter() {
        assert!(create_transport("xai_images", "https://api.x.ai/v1", "secret").is_ok());
    }

    #[test]
    fn registry_creates_the_gemini_adapter() {
        assert!(create_transport(
            "gemini_native",
            "https://generativelanguage.googleapis.com",
            "secret"
        )
        .is_ok());
    }
}
