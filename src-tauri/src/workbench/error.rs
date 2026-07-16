use serde::Serialize;

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct CommandError {
    pub code: String,
    pub message: String,
    pub diagnostic: Option<String>,
}

impl CommandError {
    pub fn new(code: impl Into<String>, message: impl Into<String>) -> Self {
        Self {
            code: code.into(),
            message: message.into(),
            diagnostic: None,
        }
    }

    pub fn with_diagnostic(mut self, diagnostic: impl Into<String>) -> Self {
        self.diagnostic = Some(diagnostic.into());
        self
    }
}

#[cfg(test)]
mod tests {
    use super::CommandError;

    #[test]
    fn serializes_a_stable_safe_error_contract() {
        let error = CommandError::new("provider.invalid", "请检查 Provider 配置。");

        assert_eq!(
            serde_json::to_value(error).unwrap(),
            serde_json::json!({
                "code": "provider.invalid",
                "message": "请检查 Provider 配置。",
                "diagnostic": null
            })
        );
    }
}
