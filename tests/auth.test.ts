import test from "node:test";
import assert from "node:assert/strict";
import { AuthRepository } from "../lib/auth-repository.ts";
import { hashPassword, tokenHash, verifyPassword } from "../lib/auth-crypto.ts";
import { Repository } from "../lib/repository.ts";
import { testDatabase } from "./helpers/database.ts";

const password = "TestPassword+123";
const hash = await hashPassword(password);
async function fixture() {
  const f = testDatabase(),
    auth = new AuthRepository(f.db);
  await auth.bootstrap({ email: "admin@example.test", hash });
  const admin = await auth.login(
    { email: " ADMIN@example.test ", password },
    "test",
  );
  const invite = () =>
    auth.invite(admin.user.id, {
      email: "organizer@example.test",
      name: "Организатор",
      workspaceName: "Тестовая группа",
    });
  return { ...f, auth, admin, invite };
}

test("администратор сохраняет прежнее пространство без изменения заказов и не перехватывает действующие аккаунты", async () => {
  const f = await fixture(),
    repo = new Repository(f.db);
  const legacy = await repo.createWorkspace("legacy-platform-owner", {
    name: "Прежняя группа",
  });
  await f.auth.adoptLegacyWorkspace(f.admin.user.id, "legacy-platform-owner");
  assert.equal((await repo.workspace(f.admin.user.id))?.id, legacy.id);
  const invitation = await f.invite(),
    accepted = await f.auth.accept(invitation.token, { password }, "test"),
    organizer = (await f.auth.session(accepted.token))!;
  await assert.rejects(() =>
    f.auth.adoptLegacyWorkspace(organizer.id, f.admin.user.id),
  );
  await f.auth.adoptLegacyWorkspace(f.admin.user.id, organizer.id);
  assert.ok(await repo.workspace(organizer.id));
  f.sqlite.close();
});

test("пароли хранятся в виде scrypt-хеша с индивидуальной солью", async () => {
  const second = await hashPassword(password);
  assert.notEqual(second, hash);
  assert.ok(await verifyPassword(password, hash));
  assert.equal(await verifyPassword("incorrect", hash), false);
  assert.equal(await verifyPassword(password, "bad hash"), false);
  assert.equal(hash.includes(password), false);
});
test("bootstrap создаёт администратора один раз и не меняет пароль при повторном запуске", async () => {
  const f = await fixture();
  await f.auth.bootstrap({
    email: f.admin.user.email,
    hash: await hashPassword("AnotherPassword+123"),
  });
  assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM users").get()!.n, 1);
  assert.equal(
    (await f.auth.login({ email: f.admin.user.email, password }, "test")).user
      .role,
    "admin",
  );
  assert.equal("password_hash" in f.admin.user, false);
  await assert.rejects(() =>
    f.auth.login({ email: f.admin.user.email, password: "wrong" }, "test"),
  );
  f.sqlite.close();
});
test("сессии случайные, в базе хранится только хеш; выход и истечение прекращают доступ", async () => {
  const f = await fixture();
  assert.equal((await f.auth.session(f.admin.token))?.id, f.admin.user.id);
  assert.notEqual(
    f.sqlite.prepare("SELECT token_hash FROM sessions").get()!.token_hash,
    f.admin.token,
  );
  await f.auth.logout(f.admin.token);
  assert.equal(await f.auth.session(f.admin.token), null);
  const next = await f.auth.newSession(f.admin.user.id);
  f.sqlite.prepare("UPDATE sessions SET expires_at='2000-01-01'").run();
  assert.equal(await f.auth.session(next.token), null);
  assert.equal(await f.auth.session("fake"), null);
  f.sqlite.close();
});
test("приглашение создаёт отдельное пространство; организатор не получает права администратора", async () => {
  const f = await fixture(),
    link = await f.invite();
  assert.equal(
    f.sqlite.prepare("SELECT token_hash FROM invitations").get()!.token_hash,
    await tokenHash(link.token),
  );
  const accepted = await f.auth.accept(link.token, { password }, "test"),
    user = (await f.auth.session(accepted.token))!;
  assert.equal(user.role, "organizer");
  assert.equal(
    (await new Repository(f.db).workspace(user.id))?.name,
    "Тестовая группа",
  );
  await assert.rejects(() => f.auth.overview(user.id));
  await assert.rejects(() =>
    f.auth.invite(user.id, {
      email: "other@example.test",
      name: "Other",
      workspaceName: "Other",
    }),
  );
  await assert.rejects(() => f.auth.setAccess(user.id, f.admin.user.id, false));
  await assert.rejects(() => f.auth.link(link.token));
  await assert.rejects(() => f.auth.accept(link.token, { password }, "test"));
  const overview = await f.auth.overview(f.admin.user.id);
  assert.equal(overview.users.length, 2);
  assert.equal(JSON.stringify(overview).includes(hash), false);
  f.sqlite.close();
});
test("отозванная, просроченная и заменённая ссылки не создают аккаунтов", async () => {
  const f = await fixture(),
    first = await f.invite(),
    second = await f.invite();
  await assert.rejects(() => f.auth.link(first.token));
  await f.auth.revoke(f.admin.user.id, second.id);
  await assert.rejects(() => f.auth.accept(second.token, { password }, "test"));
  const third = await f.invite();
  f.sqlite.prepare("UPDATE invitations SET expires_at='2000-01-01'").run();
  await assert.rejects(() => f.auth.accept(third.token, { password }, "test"));
  assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM users").get()!.n, 1);
  f.sqlite.close();
});
test("одновременное принятие приглашения создаёт только один аккаунт и одно пространство", async () => {
  const f = await fixture(),
    link = await f.invite();
  const attempts = await Promise.allSettled([
    f.auth.accept(link.token, { password }, "one"),
    f.auth.accept(link.token, { password }, "two"),
  ]);
  assert.equal(attempts.filter((x) => x.status === "fulfilled").length, 1);
  assert.equal(
    f.sqlite.prepare("SELECT COUNT(*) n FROM workspaces").get()!.n,
    1,
  );
  assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM users").get()!.n, 2);
  f.sqlite.close();
});
test("отключение немедленно отзывает сессии и ссылки восстановления; нельзя отключить себя", async () => {
  const f = await fixture(),
    link = await f.invite(),
    accepted = await f.auth.accept(link.token, { password }, "test"),
    user = (await f.auth.session(accepted.token))!;
  const reset = await f.auth.resetLink(f.admin.user.id, user.id);
  await f.auth.setAccess(f.admin.user.id, user.id, false);
  assert.equal(await f.auth.session(accepted.token), null);
  await assert.rejects(() =>
    f.auth.login({ email: user.email, password }, "test"),
  );
  await assert.rejects(() => f.auth.link(reset.token));
  await assert.rejects(() =>
    f.auth.setAccess(f.admin.user.id, f.admin.user.id, false),
  );
  await f.auth.setAccess(f.admin.user.id, user.id, true);
  assert.equal(await f.auth.session(accepted.token), null);
  assert.ok(
    (await f.auth.login({ email: user.email, password }, "test")).token,
  );
  f.sqlite.close();
});
test("восстановление меняет пароль, завершает прежние сеансы и не позволяет повтор ссылки", async () => {
  const f = await fixture(),
    invite = await f.invite(),
    account = await f.auth.accept(invite.token, { password }, "test"),
    user = (await f.auth.session(account.token))!;
  const reset = await f.auth.resetLink(f.admin.user.id, user.id);
  const changed = await f.auth.accept(
    reset.token,
    { password: "NewPassword+1234" },
    "test",
  );
  assert.equal(await f.auth.session(account.token), null);
  assert.ok(await f.auth.session(changed.token));
  await assert.rejects(() =>
    f.auth.login({ email: user.email, password }, "test"),
  );
  assert.ok(
    await f.auth.login(
      { email: user.email, password: "NewPassword+1234" },
      "test",
    ),
  );
  await assert.rejects(() => f.auth.accept(reset.token, { password }, "test"));
  f.sqlite.close();
});
test("ограничение попыток сохраняется в базе и снимается после окна ожидания", async () => {
  const f = await fixture();
  await f.auth.limit("sample", 2);
  await f.auth.limit("sample", 2);
  await assert.rejects(
    () => f.auth.limit("sample", 2),
    (e: unknown) => e instanceof Error && "status" in e && e.status === 429,
  );
  f.sqlite.prepare("UPDATE auth_limits SET resets_at='2000-01-01'").run();
  await f.auth.limit("sample", 2);
  f.sqlite.close();
});
