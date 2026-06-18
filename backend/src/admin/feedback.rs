use serde::{Deserialize, Serialize};

use crate::database::Database;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FeedbackRow {
    pub id: i64,
    pub category: String,
    pub message: String,
    pub name: Option<String>,
    pub contact: Option<String>,
    pub meta_url: Option<String>,
    pub meta_ua: Option<String>,
    pub meta_lang: Option<String>,
    pub meta_build: Option<String>,
    pub ip: String,
    pub created_at: String,
    pub handled: bool,
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FeedbackFilter {
    /// `all` (default), `new`, `archived`
    pub handled: Option<String>,
}

pub async fn list(filter: &FeedbackFilter) -> Result<Vec<FeedbackRow>, sqlx::Error> {
    macro_rules! map_row {
        ($r:expr) => {
            FeedbackRow {
                id: $r.id,
                category: $r.category,
                message: $r.message,
                name: $r.name,
                contact: $r.contact,
                meta_url: $r.meta_url,
                meta_ua: $r.meta_ua,
                meta_lang: $r.meta_lang,
                meta_build: $r.meta_build,
                ip: $r.ip,
                created_at: $r.created_at,
                handled: $r.handled != 0,
            }
        };
    }

    let rows: Vec<FeedbackRow> = match filter.handled.as_deref() {
        Some("new") => sqlx::query!(
            "
            SELECT
                  id            AS \"id!\"
                , category      AS \"category!\"
                , message       AS \"message!\"
                , name
                , contact
                , meta_url
                , meta_ua
                , meta_lang
                , meta_build
                , ip            AS \"ip!\"
                , created_at    AS \"created_at!\"
                , handled       AS \"handled!\"
            FROM feedback
            WHERE handled = 0
            ORDER BY created_at DESC
            "
        )
        .fetch_all(&Database::pool())
        .await?
        .into_iter()
        .map(|r| map_row!(r))
        .collect(),
        Some("archived") => sqlx::query!(
            "
            SELECT
                  id            AS \"id!\"
                , category      AS \"category!\"
                , message       AS \"message!\"
                , name
                , contact
                , meta_url
                , meta_ua
                , meta_lang
                , meta_build
                , ip            AS \"ip!\"
                , created_at    AS \"created_at!\"
                , handled       AS \"handled!\"
            FROM feedback
            WHERE handled = 1
            ORDER BY created_at DESC
            "
        )
        .fetch_all(&Database::pool())
        .await?
        .into_iter()
        .map(|r| map_row!(r))
        .collect(),
        _ => sqlx::query!(
            "
            SELECT
                  id            AS \"id!\"
                , category      AS \"category!\"
                , message       AS \"message!\"
                , name
                , contact
                , meta_url
                , meta_ua
                , meta_lang
                , meta_build
                , ip            AS \"ip!\"
                , created_at    AS \"created_at!\"
                , handled       AS \"handled!\"
            FROM feedback
            ORDER BY created_at DESC
            "
        )
        .fetch_all(&Database::pool())
        .await?
        .into_iter()
        .map(|r| map_row!(r))
        .collect(),
    };

    Ok(rows)
}

pub async fn delete(id: i64) -> Result<bool, sqlx::Error> {
    let result = sqlx::query!("DELETE FROM feedback WHERE id = ?", id)
        .execute(&Database::pool())
        .await?;
    Ok(result.rows_affected() > 0)
}

pub async fn set_handled(id: i64, handled: bool) -> Result<Option<FeedbackRow>, sqlx::Error> {
    let handled_int: i64 = handled.into();
    let result = sqlx::query!(
        "UPDATE feedback SET handled = ? WHERE id = ?",
        handled_int,
        id
    )
    .execute(&Database::pool())
    .await?;

    if result.rows_affected() == 0 {
        return Ok(None);
    }

    let row = sqlx::query!(
        "
        SELECT
              id            AS \"id!\"
            , category      AS \"category!\"
            , message       AS \"message!\"
            , name
            , contact
            , meta_url
            , meta_ua
            , meta_lang
            , meta_build
            , ip            AS \"ip!\"
            , created_at    AS \"created_at!\"
            , handled       AS \"handled!\"
        FROM feedback
        WHERE id = ?
        ",
        id
    )
    .fetch_optional(&Database::pool())
    .await?;

    Ok(row.map(|r| FeedbackRow {
        id: r.id,
        category: r.category,
        message: r.message,
        name: r.name,
        contact: r.contact,
        meta_url: r.meta_url,
        meta_ua: r.meta_ua,
        meta_lang: r.meta_lang,
        meta_build: r.meta_build,
        ip: r.ip,
        created_at: r.created_at,
        handled: r.handled != 0,
    }))
}
