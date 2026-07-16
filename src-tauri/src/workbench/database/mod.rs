use std::{path::Path, sync::Mutex};

use rusqlite::Connection;

use crate::workbench::error::CommandError;

pub mod providers;
pub mod schema;

pub struct Database {
    connection: Mutex<Connection>,
}

impl Database {
    pub fn open(path: &Path) -> Result<Self, CommandError> {
        let mut connection = Connection::open(path)
            .map_err(|_| CommandError::new("database.open_failed", "无法打开工作区数据库。"))?;
        connection
            .execute_batch("PRAGMA foreign_keys = ON;")
            .map_err(schema::database_error)?;
        schema::initialize_schema(&mut connection)?;
        Ok(Self {
            connection: Mutex::new(connection),
        })
    }

    pub fn with_connection<T>(
        &self,
        operation: impl FnOnce(&mut Connection) -> Result<T, CommandError>,
    ) -> Result<T, CommandError> {
        let mut connection = self
            .connection
            .lock()
            .map_err(|_| CommandError::new("database.lock_failed", "工作区数据库暂时不可用。"))?;
        operation(&mut connection)
    }
}
