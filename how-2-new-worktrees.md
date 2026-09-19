# Worktrees for gpt6-demos

Each worktree is a separate checkout of the whole repository on its own branch. They share Git history. Keep `/home/rompus/src/gpt6-demos` on `main` and create worktrees beside it in `/home/rompus/src`.

## Create a worktree and a new branch

Replace `my-task` with your task name. This starts from the latest commit on local `main`; uncommitted changes are not copied.

```sh
cd /home/rompus/src/gpt6-demos
git worktree add -b codex/my-task ../gpt6-demos-my-task main
cd /home/rompus/src/gpt6-demos-my-task
```

For an existing branch, omit `-b`. For example:

```sh
git -C /home/rompus/src/gpt6-demos worktree add /home/rompus/src/gpt6-demos-flip-slop flip-slop
```

Use a different directory and branch for each simultaneous task. A branch normally cannot be checked out in two worktrees at once.

## List worktrees

```sh
git -C /home/rompus/src/gpt6-demos worktree list
```

## Work and commit in the new directory

Edit files there, review your changes, then stage and commit them:

```sh
cd /home/rompus/src/gpt6-demos-my-task
git status
git diff
git add .
git commit -m "Implement my task"
```

## Merge back into main

Run this with a clean main checkout. If Git reports conflicts, resolve and commit them before cleanup.

```sh
cd /home/rompus/src/gpt6-demos
git switch main
git merge codex/my-task
```

## Remove the finished worktree and branch

After merging and saving any remaining work:

```sh
cd /home/rompus/src/gpt6-demos
git worktree remove /home/rompus/src/gpt6-demos-my-task
git branch -d codex/my-task
```

Use `git worktree remove` instead of deleting the directory manually. Removing a worktree and deleting its branch are separate operations.

## Existing NotAVirus worktree

Already created on branch `codex/not-a-virus-implementation`; enter the module with:

```sh
cd /home/rompus/src/gpt6-demos-not-a-virus/not-a-virus
```

The specification and implementation plan are in this checkout. Run project commands here to work on the implementation branch.

Reference: [Git worktree documentation](https://git-scm.com/docs/git-worktree).