pub mod normalized;
pub mod openai;
pub mod xai;

use std::sync::Arc;

use crate::workbench::error::CommandError;

use self::{normalized::ProviderProtocol, openai::OpenAiAdapter, xai::XaiAdapter};
use super::ProviderTransport;

pub fn create_transport(
    protocol: &str,
    base_url: &str,
    api_key: &str,
) -> Result<Arc<dyn ProviderTransport>, CommandError> {
    match ProviderProtocol::parse(protocol)? {
        ProviderProtocol::OpenAiCompatible => Ok(Arc::new(OpenAiAdapter::new(base_url, api_key)?)),
        ProviderProtocol::XaiImages => Ok(Arc::new(XaiAdapter::new(base_url, api_key)?)),
        ProviderProtocol::GeminiNative => Err(CommandError::new(
            "provider.unsupported_protocol",
            "此 Provider 协议尚未完成生成适配。",
        )),
    }
}

#[cfg(test)]
mod tests {
    use super::create_transport;

    #[test]
    fn registry_creates_the_xai_adapter() {
        assert!(create_transport("xai_images", "https://api.x.ai/v1", "secret").is_ok());
    }
}
