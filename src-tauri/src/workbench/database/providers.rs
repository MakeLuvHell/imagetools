use std::sync::Arc;

use rusqlite::{params, OptionalExtension, Row, TransactionBehavior};

use crate::workbench::{
    database::{schema::database_error, Database},
    error::CommandError,
    models::utc_now,
};

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct ProviderRecord {
    pub id: i64,
    pub protocol: String,
    pub name: String,
    pub base_url: String,
    pub api_key: String,
    pub default_model: String,
    pub available_models: Vec<String>,
    pub models_refreshed_at: Option<String>,
    pub is_default: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Clone)]
pub struct ProviderRepository {
    database: Arc<Database>,
}

impl ProviderRepository {
    pub fn new(database: Arc<Database>) -> Self {
        Self { database }
    }

    pub(crate) fn create(
        &self,
        protocol: &str,
        name: &str,
        base_url: &str,
        api_key: &str,
        default_model: &str,
        available_models: &[String],
        models_refreshed_at: Option<&str>,
        is_default: bool,
    ) -> Result<ProviderRecord, CommandError> {
        self.database.with_connection(|connection| {
            let transaction = connection.transaction().map_err(database_error)?;
            let now = utc_now();
            if is_default {
                transaction
                    .execute(
                        "UPDATE providers SET is_default = 0, updated_at = ?1",
                        [&now],
                    )
                    .map_err(database_error)?;
            }
            transaction
                .execute(
                    "INSERT INTO providers (
                        protocol, name, base_url, api_key, default_model, models_refreshed_at,
                        is_default, created_at, updated_at
                     ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8)",
                    params![
                        protocol,
                        name,
                        base_url,
                        api_key,
                        default_model,
                        models_refreshed_at,
                        is_default,
                        now
                    ],
                )
                .map_err(database_error)?;
            let provider_id = transaction.last_insert_rowid();
            replace_models(
                &transaction,
                provider_id,
                available_models,
                models_refreshed_at,
            )?;
            let provider = query_provider(&transaction, provider_id)?
                .ok_or_else(|| CommandError::new("provider.not_found", "Provider 不存在。"))?;
            transaction.commit().map_err(database_error)?;
            Ok(provider)
        })
    }

    pub(crate) fn get(&self, provider_id: i64) -> Result<Option<ProviderRecord>, CommandError> {
        self.database
            .with_connection(|connection| query_provider(connection, provider_id))
    }

    pub(crate) fn create_if_empty(
        &self,
        name: &str,
        base_url: &str,
        api_key: &str,
        default_model: &str,
    ) -> Result<Option<ProviderRecord>, CommandError> {
        self.database.with_connection(|connection| {
            let transaction = connection
                .transaction_with_behavior(TransactionBehavior::Immediate)
                .map_err(database_error)?;
            let provider_exists: bool = transaction
                .query_row("SELECT EXISTS(SELECT 1 FROM providers)", [], |row| {
                    row.get(0)
                })
                .map_err(database_error)?;
            if provider_exists {
                transaction.commit().map_err(database_error)?;
                return Ok(None);
            }

            let now = utc_now();
            transaction
                .execute(
                    "INSERT INTO providers (
                        protocol, name, base_url, api_key, default_model, is_default, created_at, updated_at
                     ) VALUES ('openai_compatible', ?1, ?2, ?3, ?4, 1, ?5, ?5)",
                    params![name, base_url, api_key, default_model, now],
                )
                .map_err(database_error)?;
            let provider_id = transaction.last_insert_rowid();
            let provider = query_provider(&transaction, provider_id)?
                .ok_or_else(|| CommandError::new("provider.not_found", "Provider 不存在。"))?;
            transaction.commit().map_err(database_error)?;
            Ok(Some(provider))
        })
    }

    pub(crate) fn list(&self) -> Result<Vec<ProviderRecord>, CommandError> {
        self.database.with_connection(|connection| {
            let mut statement = connection
                .prepare(
                    "SELECT id, protocol, name, base_url, api_key, default_model, models_refreshed_at, is_default, created_at, updated_at
                     FROM providers ORDER BY id ASC",
                )
                .map_err(database_error)?;
            let rows = statement
                .query_map([], provider_from_row)
                .map_err(database_error)?;
            let mut providers = rows
                .collect::<Result<Vec<_>, _>>()
                .map_err(database_error)?;
            drop(statement);
            for provider in &mut providers {
                provider.available_models = query_models(connection, provider.id)?;
            }
            Ok(providers)
        })
    }

    pub(crate) fn update(
        &self,
        provider_id: i64,
        protocol: &str,
        name: &str,
        base_url: &str,
        api_key: &str,
        default_model: &str,
        available_models: &[String],
        models_refreshed_at: Option<&str>,
        is_default: bool,
    ) -> Result<ProviderRecord, CommandError> {
        self.database.with_connection(|connection| {
            let transaction = connection.transaction().map_err(database_error)?;
            let now = utc_now();
            if is_default {
                transaction
                    .execute(
                        "UPDATE providers SET is_default = 0, updated_at = ?1 WHERE id != ?2",
                        params![now, provider_id],
                    )
                    .map_err(database_error)?;
            }
            let changed = transaction
                .execute(
                    "UPDATE providers
                     SET name = ?1,
                         base_url = ?2,
                         api_key = ?3,
                         default_model = ?4,
                         is_default = ?5,
                         protocol = ?6,
                         models_refreshed_at = CASE
                             WHEN ?7 IS NULL THEN models_refreshed_at
                             ELSE ?7
                         END,
                         updated_at = ?8
                     WHERE id = ?9",
                    params![
                        name,
                        base_url,
                        api_key,
                        default_model,
                        is_default,
                        protocol,
                        models_refreshed_at,
                        now,
                        provider_id
                    ],
                )
                .map_err(database_error)?;
            if changed == 0 {
                return Err(CommandError::new("provider.not_found", "Provider 不存在。"));
            }
            if models_refreshed_at.is_some() {
                replace_models(
                    &transaction,
                    provider_id,
                    available_models,
                    models_refreshed_at,
                )?;
            }
            let provider = query_provider(&transaction, provider_id)?
                .ok_or_else(|| CommandError::new("provider.not_found", "Provider 不存在。"))?;
            transaction.commit().map_err(database_error)?;
            Ok(provider)
        })
    }

    pub(crate) fn delete(&self, provider_id: i64) -> Result<(), CommandError> {
        self.database.with_connection(|connection| {
            let changed = connection
                .execute("DELETE FROM providers WHERE id = ?1", [provider_id])
                .map_err(database_error)?;
            if changed == 0 {
                return Err(CommandError::new("provider.not_found", "Provider 不存在。"));
            }
            Ok(())
        })
    }

    #[cfg(test)]
    pub(crate) fn secret(&self, provider_id: i64) -> Result<String, CommandError> {
        self.get(provider_id)?
            .map(|provider| provider.api_key)
            .ok_or_else(|| CommandError::new("provider.not_found", "Provider 不存在。"))
    }
}

fn query_provider(
    connection: &rusqlite::Connection,
    provider_id: i64,
) -> Result<Option<ProviderRecord>, CommandError> {
    let mut provider = connection
        .query_row(
            "SELECT id, protocol, name, base_url, api_key, default_model, models_refreshed_at, is_default, created_at, updated_at
             FROM providers WHERE id = ?1",
            [provider_id],
            provider_from_row,
        )
        .optional()
        .map_err(database_error)?;
    if let Some(provider) = &mut provider {
        provider.available_models = query_models(connection, provider.id)?;
    }
    Ok(provider)
}

fn query_models(
    connection: &rusqlite::Connection,
    provider_id: i64,
) -> Result<Vec<String>, CommandError> {
    let mut statement = connection
        .prepare("SELECT model_id FROM provider_models WHERE provider_id = ?1 ORDER BY rowid ASC")
        .map_err(database_error)?;
    let models = statement
        .query_map([provider_id], |row| row.get(0))
        .map_err(database_error)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(database_error)?;
    Ok(models)
}

fn replace_models(
    transaction: &rusqlite::Transaction<'_>,
    provider_id: i64,
    models: &[String],
    refreshed_at: Option<&str>,
) -> Result<(), CommandError> {
    transaction
        .execute(
            "DELETE FROM provider_models WHERE provider_id = ?1",
            [provider_id],
        )
        .map_err(database_error)?;
    let Some(discovered_at) = refreshed_at else {
        return Ok(());
    };
    for model in models {
        transaction
            .execute(
                "INSERT INTO provider_models (provider_id, model_id, discovered_at) VALUES (?1, ?2, ?3)",
                params![provider_id, model, discovered_at],
            )
            .map_err(database_error)?;
    }
    Ok(())
}

fn provider_from_row(row: &Row<'_>) -> rusqlite::Result<ProviderRecord> {
    Ok(ProviderRecord {
        id: row.get(0)?,
        protocol: row.get(1)?,
        name: row.get(2)?,
        base_url: row.get(3)?,
        api_key: row.get(4)?,
        default_model: row.get(5)?,
        available_models: Vec::new(),
        models_refreshed_at: row.get(6)?,
        is_default: row.get(7)?,
        created_at: row.get(8)?,
        updated_at: row.get(9)?,
    })
}
