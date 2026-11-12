import { z } from "zod";
import { AppError } from "./domain.ts";
import type { Database } from "./repository.ts";
import {
  dummyPasswordHash,
  hashPassword,
  randomToken,
  tokenHash,
  verifyPassword,
  randomEmailCode,
  emailCodeHash,
  verifyEmailCode,
} from "./auth-crypto.ts";

const email = z
  .string()
  .trim()
  .email()
  .max(254)
  .transform((s) => s.toLowerCase());
const name = z.string().trim().min(2).max(80);
export const passwordInput = z
  .string()
  .min(10, "Пароль должен содержать минимум 10 символов")
  .max(128);
export const invitationInput = z
  .object({
    email,
    name,
    workspaceName: name,
    sendEmail: z.boolean().default(false),
  })
  .strict();
export type User = {
  id: string;
  email: string;
  name: string;
  role: "admin" | "organizer";
  status: "active" | "disabled";
  created_at: string;
  last_login_at: string | null;
};
type StoredUser = User & { password_hash: string };
type AccessLink = {
  id: string;
  kind: "invite" | "reset";
  email: string;
  name: string;
  workspace_name: string;
  expires_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
};
export const SESSION_SECONDS = 30 * 24 * 60 * 60;
const now = () => new Date().toISOString();
const publicUser = (u: StoredUser): User => ({
  id: u.id,
  email: u.email,
  name: u.name,
  role: u.role,
  status: u.status,
  created_at: u.created_at,
  last_login_at: u.last_login_at,
});

export class AuthRepository {
  private db: Database;
  private emailSecret?: string;
  constructor(db: Database, emailSecret?: string) {
    this.db = db;
    this.emailSecret = emailSecret;
  }

  private codeSecret() {
    if (!this.emailSecret || !/^[a-f0-9]{64}$/i.test(this.emailSecret))
      throw new AppError(
        "Подтверждение email пока не настроено. Обратитесь к администратору.",
        503,
      );
    return this.emailSecret;
  }

  async bootstrap(config: { email?: string; hash?: string; name?: string }) {
    if (!config.email || !config.hash) return;
    const address = email.parse(config.email);
    if (!/^scrypt\$32768\$8\$3\$[a-f0-9]{32}\$[a-f0-9]{64}$/.test(config.hash))
      throw new Error("Invalid bootstrap password hash");
    // Bootstrap can create an administrator, never promote an existing account.
    await this.db
      .prepare(
        "INSERT INTO users (id,email,name,password_hash,role,status,created_at) VALUES (?,?,?,?,'admin','active',?) ON CONFLICT(email) DO NOTHING",
      )
      .bind(
        crypto.randomUUID(),
        address,
        config.name || "Ansar",
        config.hash,
        now(),
      )
      .run();
  }

  async requireAdmin(userId: string) {
    const user = await this.db
      .prepare(
        "SELECT id,email,name,role,status,created_at,last_login_at FROM users WHERE id=? AND role='admin' AND status='active'",
      )
      .bind(userId)
      .first<User>();
    if (!user) throw new AppError("Доступ разрешён только администратору", 403);
    return user;
  }

  async adoptLegacyWorkspace(admin: string, legacyOwner: string) {
    await this.requireAdmin(admin);
    // Only a trusted platform identity is supplied here, after successful login.
    // Reassign the owner; campaign/order IDs and their data remain unchanged.
    await this.db
      .prepare(
        "UPDATE workspaces SET owner_id=? WHERE owner_id=? AND NOT EXISTS(SELECT 1 FROM workspaces WHERE owner_id=?) AND NOT EXISTS(SELECT 1 FROM users WHERE id=?)",
      )
      .bind(admin, legacyOwner, admin, legacyOwner)
      .run();
  }

  async limit(key: string, maximum: number, seconds = 900) {
    const time = now(),
      until = new Date(Date.now() + seconds * 1000).toISOString();
    const hashed = await tokenHash(key);
    const result = await this.db
      .prepare(
        "INSERT INTO auth_limits (key,attempts,resets_at) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN resets_at<=? THEN 1 ELSE attempts+1 END,resets_at=CASE WHEN resets_at<=? THEN excluded.resets_at ELSE resets_at END RETURNING attempts",
      )
      .bind(hashed, until, time, time)
      .first<{ attempts: number }>();
    if (!result || result.attempts > maximum)
      throw new AppError(
        seconds <= 60
          ? "Повторно запросить код можно через минуту."
          : "Слишком много попыток. Попробуйте через 15 минут.",
        429,
      );
  }

  async login(input: unknown, client: string) {
    const data = z
      .object({ email, password: z.string().min(1).max(128) })
      .strict()
      .parse(input);
    await this.limit(`login-ip:${client}`, 60);
    await this.limit(`login-email:${data.email}`, 10);
    const user = await this.db
      .prepare("SELECT * FROM users WHERE email=?")
      .bind(data.email)
      .first<StoredUser>();
    const valid = await verifyPassword(
      data.password,
      user?.password_hash || dummyPasswordHash,
    );
    if (!user || !valid || user.status !== "active")
      throw new AppError(
        "Неверный email или пароль, либо доступ отключён",
        401,
      );
    await this.db
      .prepare("DELETE FROM auth_limits WHERE key=?")
      .bind(await tokenHash(`login-email:${data.email}`))
      .run();
    return { user: publicUser(user), ...(await this.newSession(user.id)) };
  }

  async newSession(userId: string) {
    const token = randomToken(),
      time = now(),
      expiresAt = new Date(Date.now() + SESSION_SECONDS * 1000).toISOString();
    await this.db.batch([
      this.db.prepare("DELETE FROM sessions WHERE expires_at<=?").bind(time),
      this.db.prepare("DELETE FROM auth_limits WHERE resets_at<=?").bind(time),
      this.db
        .prepare(
          "INSERT INTO sessions (token_hash,user_id,expires_at,created_at) VALUES (?,?,?,?)",
        )
        .bind(await tokenHash(token), userId, expiresAt, time),
      this.db
        .prepare("UPDATE users SET last_login_at=? WHERE id=?")
        .bind(time, userId),
    ]);
    return { token, expiresAt };
  }

  async session(token: string | undefined) {
    if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
    return this.db
      .prepare(
        "SELECT u.id,u.email,u.name,u.role,u.status,u.created_at,u.last_login_at FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>? AND u.status='active'",
      )
      .bind(await tokenHash(token), now())
      .first<User>();
  }

  async logout(token: string | undefined) {
    if (token)
      await this.db
        .prepare("DELETE FROM sessions WHERE token_hash=?")
        .bind(await tokenHash(token))
        .run();
  }

  async overview(admin: string) {
    await this.requireAdmin(admin);
    const { results: users } = await this.db
      .prepare(
        "SELECT u.id,u.email,u.name,u.role,u.status,u.created_at,u.last_login_at,w.name AS workspace_name,(SELECT COUNT(*) FROM campaigns c WHERE c.workspace_id=w.id) AS campaigns,(SELECT COUNT(*) FROM orders o WHERE o.workspace_id=w.id) AS orders FROM users u LEFT JOIN workspaces w ON w.owner_id=u.id ORDER BY u.created_at DESC",
      )
      .all<
        User & {
          workspace_name: string | null;
          campaigns: number;
          orders: number;
        }
      >();
    const { results: invitations } = await this.db
      .prepare(
        "SELECT id,kind,email,name,workspace_name,created_at,expires_at,accepted_at,revoked_at,delivery_status FROM invitations WHERE kind='invite' ORDER BY created_at DESC LIMIT 100",
      )
      .all<AccessLink & { created_at: string; delivery_status: string }>();
    return { users, invitations };
  }

  async invite(admin: string, input: unknown) {
    await this.requireAdmin(admin);
    const data = invitationInput.parse(input);
    if (
      await this.db
        .prepare("SELECT id FROM users WHERE email=?")
        .bind(data.email)
        .first()
    )
      throw new AppError("У этого email уже есть аккаунт", 409);
    return this.createLink(admin, "invite", data);
  }

  private async createLink(
    admin: string,
    kind: "invite" | "reset",
    data: { email: string; name: string; workspaceName: string },
  ) {
    const id = crypto.randomUUID(),
      token = randomToken(),
      time = now(),
      expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    await this.db.batch([
      this.db
        .prepare(
          "UPDATE invitations SET revoked_at=? WHERE email=? AND kind=? AND accepted_at IS NULL AND revoked_at IS NULL",
        )
        .bind(time, data.email, kind),
      this.db
        .prepare(
          "INSERT INTO invitations (id,kind,email,name,workspace_name,token_hash,created_by,created_at,expires_at) VALUES (?,?,?,?,?,?,?,?,?)",
        )
        .bind(
          id,
          kind,
          data.email,
          data.name,
          data.workspaceName,
          await tokenHash(token),
          admin,
          time,
          expiresAt,
        ),
    ]);
    return { id, token, expiresAt, email: data.email, name: data.name, kind };
  }

  async link(token: string) {
    if (!/^[a-f0-9]{64}$/.test(token))
      throw new AppError(
        "Приглашение недействительно или срок ссылки истёк",
        404,
      );
    const link = await this.db
      .prepare(
        "SELECT id,kind,email,name,workspace_name,expires_at,accepted_at,revoked_at FROM invitations WHERE token_hash=? AND expires_at>? AND accepted_at IS NULL AND revoked_at IS NULL AND (kind='invite' OR delivery_status='sent')",
      )
      .bind(await tokenHash(token), now())
      .first<AccessLink>();
    if (!link)
      throw new AppError(
        "Приглашение недействительно или срок ссылки истёк",
        404,
      );
    return link;
  }

  async accept(token: string, input: unknown, client: string) {
    await this.limit(`accept-ip:${client}`, 20);
    const data = z
      .object({
        password: passwordInput,
        code: z.string().regex(/^\d{6}$/, "Введите код из 6 цифр"),
        challenge: z.string().regex(/^[a-f0-9]{64}$/),
      })
      .strict()
      .parse(input);
    const link = await this.link(token);
    const challengeHash = await this.checkEmailProof(
      link.id,
      data.challenge,
      data.code,
    );
    const password = await hashPassword(data.password),
      time = now(),
      consumption = randomToken();
    const consume = this.db
      .prepare(
        "UPDATE email_challenges SET consumed_at=?,consumption_id=? WHERE token_hash=? AND invitation_id=? AND consumed_at IS NULL AND delivered_at IS NOT NULL AND expires_at>? AND attempts<=5 AND EXISTS(SELECT 1 FROM invitations WHERE id=? AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at>?)",
      )
      .bind(time, consumption, challengeHash, link.id, time, link.id, time);
    let userId: string;
    if (link.kind === "invite") {
      userId = crypto.randomUUID();
      const result = await this.db.batch([
        consume,
        this.db
          .prepare(
            "INSERT INTO users (id,email,name,password_hash,role,status,created_at,email_verified_at) SELECT ?,?,?,?,'organizer','active',?,? WHERE EXISTS (SELECT 1 FROM invitations WHERE id=? AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at>?) AND EXISTS(SELECT 1 FROM email_challenges WHERE token_hash=? AND consumption_id=?) ON CONFLICT(email) DO NOTHING",
          )
          .bind(
            userId,
            link.email,
            link.name,
            password,
            time,
            time,
            link.id,
            time,
            challengeHash,
            consumption,
          ),
        this.db
          .prepare(
            "INSERT INTO workspaces (id,owner_id,name,is_demo,created_at) SELECT ?,?,?,0,? WHERE EXISTS (SELECT 1 FROM users WHERE id=?)",
          )
          .bind(crypto.randomUUID(), userId, link.workspace_name, time, userId),
        this.db
          .prepare(
            "UPDATE invitations SET accepted_at=? WHERE id=? AND EXISTS(SELECT 1 FROM users WHERE id=?)",
          )
          .bind(time, link.id, userId),
      ]);
      if (!result[0].meta.changes || !result[1].meta.changes)
        throw new AppError("Приглашение уже использовано или отозвано", 409);
    } else {
      const user = await this.db
        .prepare("SELECT id FROM users WHERE email=? AND status='active'")
        .bind(link.email)
        .first<{ id: string }>();
      if (!user) throw new AppError("Аккаунт недоступен", 403);
      userId = user.id;
      const result = await this.db.batch([
        consume,
        this.db
          .prepare(
            "UPDATE users SET password_hash=?,email_verified_at=? WHERE id=? AND status='active' AND EXISTS(SELECT 1 FROM invitations WHERE id=? AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at>?) AND EXISTS(SELECT 1 FROM email_challenges WHERE token_hash=? AND consumption_id=?)",
          )
          .bind(
            password,
            time,
            userId,
            link.id,
            time,
            challengeHash,
            consumption,
          ),
        this.db
          .prepare(
            "UPDATE invitations SET accepted_at=? WHERE id=? AND changes()>0",
          )
          .bind(time, link.id),
        this.db
          .prepare(
            "DELETE FROM sessions WHERE user_id=? AND EXISTS(SELECT 1 FROM invitations WHERE id=? AND accepted_at=?)",
          )
          .bind(userId, link.id, time),
      ]);
      if (!result[0].meta.changes || !result[1].meta.changes)
        throw new AppError("Ссылка уже использована или отозвана", 409);
    }
    return {
      ...(await this.newSession(userId)),
      next: link.kind === "reset" ? "/login" : "/",
    };
  }

  async requestEmailCode(
    token: string,
    client: string,
    deliver: (message: {
      email: string;
      name: string;
      code: string;
    }) => Promise<void>,
  ) {
    const secret = this.codeSecret(),
      link = await this.link(token);
    await this.limit(`email-code-ip:${client}`, 20);
    await this.limit(`email-code-email:${link.email}`, 5);
    await this.limit(`email-code-cooldown:${link.id}`, 1, 60);
    const challenge = randomToken(),
      challengeHash = await tokenHash(challenge),
      code = randomEmailCode();
    const time = now(),
      expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    await this.db
      .prepare(
        "INSERT INTO email_challenges (token_hash,invitation_id,code_hash,created_at,expires_at) VALUES (?,?,?,?,?)",
      )
      .bind(
        challengeHash,
        link.id,
        await emailCodeHash(secret, link.id, challengeHash, code),
        time,
        expiresAt,
      )
      .run();
    try {
      await deliver({ email: link.email, name: link.name, code });
      await this.db.batch([
        this.db
          .prepare(
            "UPDATE email_challenges SET consumed_at=? WHERE invitation_id=? AND token_hash!=? AND consumed_at IS NULL",
          )
          .bind(now(), link.id, challengeHash),
        this.db
          .prepare(
            "UPDATE email_challenges SET delivered_at=? WHERE token_hash=?",
          )
          .bind(now(), challengeHash),
      ]);
    } catch {
      await this.db
        .prepare("UPDATE email_challenges SET consumed_at=? WHERE token_hash=?")
        .bind(now(), challengeHash)
        .run();
      throw new AppError(
        "Не удалось отправить код на email. Повторите запрос через минуту.",
        503,
      );
    }
    return { challenge, expiresAt, resendAfterSeconds: 60 };
  }

  private async checkEmailProof(
    invitationId: string,
    challenge: string,
    code: string,
  ) {
    const secret = this.codeSecret(),
      challengeHash = await tokenHash(challenge);
    const proof = await this.db
      .prepare(
        "UPDATE email_challenges SET attempts=attempts+1 WHERE token_hash=? AND invitation_id=? AND consumed_at IS NULL AND delivered_at IS NOT NULL AND expires_at>? AND attempts<5 RETURNING code_hash",
      )
      .bind(challengeHash, invitationId, now())
      .first<{ code_hash: string }>();
    if (!proof)
      throw new AppError(
        "Код истёк или число попыток исчерпано. Запросите новый код.",
        400,
      );
    if (
      !(await verifyEmailCode(
        secret,
        invitationId,
        challengeHash,
        code,
        proof.code_hash,
      ))
    )
      throw new AppError("Неверный код из письма", 400);
    return challengeHash;
  }

  async revoke(admin: string, id: string) {
    await this.requireAdmin(admin);
    await this.db
      .prepare(
        "UPDATE invitations SET revoked_at=? WHERE id=? AND accepted_at IS NULL",
      )
      .bind(now(), id)
      .run();
  }

  async setAccess(admin: string, id: string, active: boolean) {
    await this.requireAdmin(admin);
    if (id === admin)
      throw new AppError("Нельзя отключить собственный аккаунт");
    const result = await this.db.batch([
      this.db
        .prepare("UPDATE users SET status=? WHERE id=? AND role='organizer'")
        .bind(active ? "active" : "disabled", id),
      this.db.prepare("DELETE FROM sessions WHERE user_id=?").bind(id),
      this.db
        .prepare(
          "UPDATE invitations SET revoked_at=? WHERE kind='reset' AND email=(SELECT email FROM users WHERE id=?) AND accepted_at IS NULL AND revoked_at IS NULL",
        )
        .bind(now(), id),
    ]);
    if (!result[0].meta.changes)
      throw new AppError("Организатор не найден", 404);
  }

  async sendPasswordReset(
    admin: string,
    id: string,
    deliver: (message: {
      email: string;
      name: string;
      token: string;
    }) => Promise<void>,
  ) {
    await this.requireAdmin(admin);
    const user = await this.db
      .prepare("SELECT email,name FROM users WHERE id=? AND status='active'")
      .bind(id)
      .first<{ email: string; name: string }>();
    if (!user) throw new AppError("Аккаунт недоступен", 404);
    await this.limit(`password-reset:${user.email}`, 3);
    const link = await this.createLink(admin, "reset", {
      ...user,
      workspaceName: "",
    });
    try {
      // The delivery adapter receives the token; administrators never receive it.
      await deliver({ email: user.email, name: user.name, token: link.token });
      await this.delivery(link.id, "sent");
    } catch {
      await this.revoke(admin, link.id);
      await this.delivery(link.id, "failed");
      throw new AppError(
        "Не удалось отправить письмо восстановления. Повторите отправку позже.",
        502,
      );
    }
    return { delivery: "sent" as const };
  }

  async delivery(id: string, status: "sent" | "failed") {
    await this.db
      .prepare("UPDATE invitations SET delivery_status=? WHERE id=?")
      .bind(status, id)
      .run();
  }
}

export type AdminOverview = Awaited<ReturnType<AuthRepository["overview"]>>;
