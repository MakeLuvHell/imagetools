use std::{future::Future, pin::Pin};

use crate::workbench::error::CommandError;

use super::super::{
    client::{ProviderClient, ProviderResponse},
    EditRequest, GenerationRequest, ProviderTransport,
};

pub struct OpenAiAdapter {
    client: ProviderClient,
}

impl OpenAiAdapter {
    pub fn new(base_url: &str, api_key: &str) -> Result<Self, CommandError> {
        Ok(Self {
            client: ProviderClient::new(base_url, api_key)?,
        })
    }
}

impl ProviderTransport for OpenAiAdapter {
    fn generate<'a>(
        &'a self,
        request: &'a GenerationRequest,
    ) -> Pin<Box<dyn Future<Output = Result<ProviderResponse, CommandError>> + Send + 'a>> {
        Box::pin(async move { self.client.generate(request).await })
    }

    fn edit<'a>(
        &'a self,
        request: &'a EditRequest,
        filename: String,
        mime_type: &'a str,
        image: Vec<u8>,
    ) -> Pin<Box<dyn Future<Output = Result<ProviderResponse, CommandError>> + Send + 'a>> {
        Box::pin(async move { self.client.edit(request, filename, mime_type, image).await })
    }
}
