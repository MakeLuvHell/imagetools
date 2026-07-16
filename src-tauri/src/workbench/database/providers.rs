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
    pub name: String,
    pub base_url: String,
    pub api_key: String,
    pub default_model: String,
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
        name: &str,
        base_url: &str,
        api_key: &str,
        default_model: &str,
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
                        name, base_url, api_key, default_model, is_default, created_at, updated_at
                     ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)",
                    params![name, base_url, api_key, default_model, is_default, now],
                )
                .map_err(database_error)?;
            let provider_id = transaction.last_insert_rowid();
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
                        name, base_url, api_key, default_model, is_default, created_at, updated_at
                     ) VALUES (?1, ?2, ?3, ?4, 1, ?5, ?5)",
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
                    "SELECT id, name, base_url, api_key, default_model, is_default, created_at, updated_at
                     FROM providers ORDER BY id ASC",
                )
                .map_err(database_error)?;
            let rows = statement
                .query_map([], provider_from_row)
                .map_err(database_error)?;
            rows.collect::<Result<Vec<_>, _>>().map_err(database_error)
        })
    }

    pub(crate) fn update(
        &self,
        provider_id: i64,
        name: &str,
        base_url: &str,
        api_key: &str,
        default_model: &str,
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
                         updated_at = ?6
                     WHERE id = ?7",
                    params![
                        name,
                        base_url,
                        api_key,
                        default_model,
                        is_default,
                        now,
                        provider_id
                    ],
                )
                .map_err(database_error)?;
            if changed == 0 {
                return Err(CommandError::new("provider.not_found", "Provider 不存在。"));
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
    connection
        .query_row(
            "SELECT id, name, base_url, api_key, default_model, is_default, created_at, updated_at
             FROM providers WHERE id = ?1",
            [provider_id],
            provider_from_row,
        )
        .optional()
        .map_err(database_error)
}

fn provider_from_row(row: &Row<'_>) -> rusqlite::Result<ProviderRecord> {
    Ok(ProviderRecord {
        id: row.get(0)?,
        name: row.get(1)?,
        base_url: row.get(2)?,
        api_key: row.get(3)?,
        default_model: row.get(4)?,
        is_default: row.get(5)?,
        created_at: row.get(6)?,
        updated_at: row.get(7)?,
    })
}
