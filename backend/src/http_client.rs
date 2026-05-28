use std::sync::LazyLock;

pub static HTTP_CLIENT: LazyLock<reqwest::Client> = LazyLock::new(|| {
    let certs = webpki_root_certs::TLS_SERVER_ROOT_CERTS
        .iter()
        .filter_map(|cert| reqwest::Certificate::from_der(cert.as_ref()).ok());

    reqwest::Client::builder()
        .tls_certs_only(certs)
        .build()
        .expect("Failed to build HTTP client")
});
