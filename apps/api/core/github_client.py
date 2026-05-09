from __future__ import annotations

import subprocess
import tempfile
from pathlib import Path

from github import Auth, Github, GithubIntegration

from core.config import Settings


class GitHubClient:
    def __init__(self, settings: Settings):
        if settings.github_pat:
            # PAT path: simpler, used when the org blocks third-party Apps.
            self._token = settings.github_pat
            self._gh = Github(auth=Auth.Token(self._token))
        elif settings.github_app_id:
            self._app_id = int(settings.github_app_id)
            self._installation_id = int(settings.github_app_installation_id)
            self._private_key = settings.github_app_private_key
            self._integration = GithubIntegration(
                auth=Auth.AppAuth(self._app_id, self._private_key)
            )
            self._token = self._integration.get_access_token(self._installation_id).token
            self._gh = Github(auth=Auth.Token(self._token))
        else:
            raise RuntimeError(
                "GitHub auth not configured: set GITHUB_PAT or the GITHUB_APP_* trio."
            )

    # ------------------------------------------------------------------
    # Filesystem
    # ------------------------------------------------------------------
    def clone_repo(self, repo_full_name: str) -> Path:
        dest = Path(tempfile.mkdtemp(prefix="helix-clone-"))
        url = f"https://x-access-token:{self._token}@github.com/{repo_full_name}.git"
        subprocess.run(
            ["git", "clone", "--depth=1", url, str(dest)],
            check=True,
            capture_output=True,
        )
        return dest

    # ------------------------------------------------------------------
    # Read
    # ------------------------------------------------------------------
    def read_file(self, repo: str, path: str) -> str:
        repo_obj = self._gh.get_repo(repo)
        content = repo_obj.get_contents(path)
        if isinstance(content, list):
            raise ValueError(f"{path} is a directory, not a file")
        return content.decoded_content.decode("utf-8")

    def list_directory(self, repo: str, path: str) -> list[str]:
        repo_obj = self._gh.get_repo(repo)
        items = repo_obj.get_contents(path)
        if not isinstance(items, list):
            return [items.name]
        return [it.name for it in items]

    # ------------------------------------------------------------------
    # Write
    # ------------------------------------------------------------------
    def create_branch(self, repo: str, branch_name: str, base: str = "main") -> str:
        repo_obj = self._gh.get_repo(repo)
        base_ref = repo_obj.get_git_ref(f"heads/{base}")
        new_ref = repo_obj.create_git_ref(f"refs/heads/{branch_name}", base_ref.object.sha)
        return new_ref.ref

    def commit_files(
        self,
        repo: str,
        branch: str,
        files: dict[str, str],
        message: str,
    ) -> str:
        repo_obj = self._gh.get_repo(repo)
        branch_ref = repo_obj.get_git_ref(f"heads/{branch}")
        base_sha = branch_ref.object.sha
        base_tree = repo_obj.get_git_tree(base_sha)
        elements = []
        for path, content in files.items():
            blob = repo_obj.create_git_blob(content, "utf-8")
            elements.append(
                {
                    "path": path,
                    "mode": "100644",
                    "type": "blob",
                    "sha": blob.sha,
                }
            )
        tree = repo_obj.create_git_tree(elements, base_tree=base_tree)
        parent = repo_obj.get_git_commit(base_sha)
        commit = repo_obj.create_git_commit(message=message, tree=tree, parents=[parent])
        branch_ref.edit(commit.sha)
        return commit.sha

    def create_pr(
        self,
        repo: str,
        head: str,
        base: str,
        title: str,
        body: str,
    ) -> str:
        repo_obj = self._gh.get_repo(repo)
        pr = repo_obj.create_pull(title=title, body=body, head=head, base=base)
        return pr.html_url

    def delete_branch(self, repo: str, branch: str) -> None:
        repo_obj = self._gh.get_repo(repo)
        ref = repo_obj.get_git_ref(f"heads/{branch}")
        ref.delete()

    # ------------------------------------------------------------------
    # All-in-one: multi-blob -> tree -> commit -> ref -> PR
    # ------------------------------------------------------------------
    def commit_files_and_open_pr(
        self,
        *,
        repo: str,
        branch: str,
        base: str,
        files: dict[str, str],
        title: str,
        body: str,
    ) -> str:
        repo_obj = self._gh.get_repo(repo)
        base_ref = repo_obj.get_git_ref(f"heads/{base}")
        base_sha = base_ref.object.sha

        repo_obj.create_git_ref(f"refs/heads/{branch}", base_sha)

        elements = []
        for path, content in files.items():
            blob = repo_obj.create_git_blob(content, "utf-8")
            elements.append(
                {
                    "path": path,
                    "mode": "100644",
                    "type": "blob",
                    "sha": blob.sha,
                }
            )

        tree = repo_obj.create_git_tree(elements, base_tree=repo_obj.get_git_tree(base_sha))
        parent_commit = repo_obj.get_git_commit(base_sha)
        commit = repo_obj.create_git_commit(message=title, tree=tree, parents=[parent_commit])

        new_ref = repo_obj.get_git_ref(f"heads/{branch}")
        new_ref.edit(commit.sha)

        pr = repo_obj.create_pull(title=title, body=body, head=branch, base=base)
        return pr.html_url
