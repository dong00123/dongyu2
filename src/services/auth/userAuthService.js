import { AppError } from '../../core/AppError.js';
import { findOrCreateOauthUser, findUserByEmail, createLocalUser } from '../../repositories/userRepository.js';
import { hashPassword, verifyPassword } from './passwordService.js';

export function registerLocalUser({ email, password, nickname }) {
  if (!email || !password || !nickname) {
    throw new AppError('邮箱、密码和昵称不能为空', 400);
  }

  const normalizedEmail = email.trim().toLowerCase();
  if (findUserByEmail(normalizedEmail)) {
    throw new AppError('该邮箱已注册', 409);
  }

  return createLocalUser({
    email: normalizedEmail,
    passwordHash: hashPassword(password),
    nickname: nickname.trim()
  });
}

export function loginLocalUser({ email, password }) {
  if (!email || !password) {
    throw new AppError('邮箱和密码不能为空', 400);
  }

  const user = findUserByEmail(email.trim().toLowerCase());
  if (!user || !verifyPassword(password, user.passwordHash)) {
    throw new AppError('邮箱或密码错误', 401);
  }

  return {
    id: user.id,
    email: user.email,
    nickname: user.nickname,
    avatar: user.avatar,
    authType: user.authType
  };
}

export function loginOauthUser(profile) {
  return findOrCreateOauthUser(profile);
}
