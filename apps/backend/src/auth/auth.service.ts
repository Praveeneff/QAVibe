import {
  Injectable,
  ConflictException,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcrypt";
import { PrismaService } from "../prisma/prisma.service";
import { Role } from '@prisma/client';

const BCRYPT_ROUNDS = 12;

export type SafeUser = {
  id:        string;
  email:     string;
  name:      string;
  role:      string;
  createdAt: Date;
  updatedAt: Date;
};

function stripHash(user: { passwordHash: string } & SafeUser): SafeUser {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { passwordHash: _h, ...safe } = user;
  return safe;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt:    JwtService,
  ) {}

  // ── Register ───────────────────────────────────────────────────────────────

  async register(email: string, password: string, name: string) {
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) throw new ConflictException("An account with this email already exists");

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    // First user ever → admin; everyone else → tester
    const user = await this.prisma.$transaction(async (tx) => {
      // Atomic: count and create in one transaction — prevents dual-admin race condition
      const userCount = await tx.user.count();
      const role = userCount === 0 ? Role.admin : Role.tester;
      return tx.user.create({
        data: { email, passwordHash, name, role },
      });
    });

    return { token: this.sign(user), user: stripHash(user) };
  }

  // ── Login ──────────────────────────────────────────────────────────────────

  async login(email: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) throw new UnauthorizedException("Invalid email or password");

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) throw new UnauthorizedException("Invalid email or password");

    return { token: this.sign(user), user: stripHash(user) };
  }

  // ── Validate (used by JwtStrategy) ────────────────────────────────────────

  async validateUser(userId: string): Promise<SafeUser | null> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) return null;
    return stripHash(user);
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private sign(user: { id: string; email: string; role: string }): string {
    return this.jwt.sign({ sub: user.id, email: user.email, role: user.role });
  }
}
