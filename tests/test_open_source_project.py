import tomllib
from pathlib import Path


ROOT = Path(".")
README = ROOT / "README.md"
USER_GUIDE = ROOT / "docs/user-guide.md"


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def test_readme_exposes_release_visuals_and_community_documents():
    text = README.read_text(encoding="utf-8")

    assert "actions/workflows/ci.yml/badge.svg" in text
    assert "github.com/MakeLuvHell/imagetools/releases/latest" in text
    assert "tests/ui/codex_windows.spec.js-snapshots/shell-1280x860-dark-chromium-linux.png" in text
    for target in (
        "docs/user-guide.md",
        "CONTRIBUTING.md",
        "SECURITY.md",
        "CODE_OF_CONDUCT.md",
        "docs/roadmap.md",
        "LICENSE",
    ):
        assert f"]({target})" in text


def test_user_guide_explains_provider_data_flow_and_release_integrity():
    text = USER_GUIDE.read_text(encoding="utf-8")

    assert "## 数据与隐私" in text
    assert "提示词" in text
    assert "参考图" in text
    assert "配置的 Provider" in text
    assert "SHA256SUMS" in text


def test_security_and_contribution_policies_cover_sensitive_reports_and_gates():
    security = read("SECURITY.md")
    contributing = read("CONTRIBUTING.md")
    conduct = read("CODE_OF_CONDUCT.md")

    assert "security/advisories/new" in security
    assert "不要" in security and "API Key" in security
    assert "mise run test" in contributing
    assert "mise run ui-test" in contributing
    assert "cargo test" in contributing
    assert "Windows 门禁" in contributing
    assert "行为准则" in conduct


def test_repository_has_structured_issue_and_pull_request_templates():
    config = read(".github/ISSUE_TEMPLATE/config.yml")
    bug = read(".github/ISSUE_TEMPLATE/bug_report.yml")
    feature = read(".github/ISSUE_TEMPLATE/feature_request.yml")
    provider = read(".github/ISSUE_TEMPLATE/provider_compatibility.yml")
    pull_request = read(".github/pull_request_template.md")

    assert "blank_issues_enabled: false" in config
    assert "版本" in bug and "安装方式" in bug and "API Key" in bug
    assert "使用场景" in feature
    assert "Provider 协议" in provider and "Base URL" in provider
    assert "验证" in pull_request and "数据库" in pull_request


def test_ci_checks_pushes_and_pull_requests_with_read_only_permissions():
    workflow = read(".github/workflows/ci.yml")

    assert "pull_request:" in workflow
    assert "push:" in workflow
    assert "contents: read" in workflow
    assert "mise run test" in workflow
    assert "cargo fmt" in workflow
    assert "cargo test" in workflow
    assert "mise run desktop-check" in workflow
    assert "mise run ui-test" in workflow


def test_dependabot_covers_all_dependency_ecosystems():
    config = read(".github/dependabot.yml")

    for ecosystem in ("npm", "cargo", "github-actions"):
        assert f'package-ecosystem: "{ecosystem}"' in config


def test_rust_package_declares_open_source_metadata():
    package = tomllib.loads(read("src-tauri/Cargo.toml"))["package"]

    assert package["license"] == "MIT"
    assert package["repository"] == "https://github.com/MakeLuvHell/imagetools"
    assert package["homepage"] == "https://github.com/MakeLuvHell/imagetools"


def test_roadmap_states_supported_platform_and_non_commitments():
    roadmap = read("docs/roadmap.md")

    assert "Windows x64" in roadmap
    assert "Linux" in roadmap
    assert "macOS" in roadmap
    assert "代码签名" in roadmap
    assert "自动更新" in roadmap
