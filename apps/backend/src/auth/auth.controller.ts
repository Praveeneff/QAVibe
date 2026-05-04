import {
  Controller,
  Post,
  Get,
  Patch,
  Param,
  Body,
  UseGuards,
  Request,
  BadRequestException,
  ForbiddenException,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
import { Throttle, SkipThrottle } from "@nestjs/throttler";
import { AuthService } from "./auth.service";
import { JwtAuthGuard } from "./jwt-auth.guard";
import { RegisterDto } from "./register.dto";
import { Role } from "@prisma/client";

interface LoginBody { email: string; password: string; }

@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post("register")
  @Throttle({ default: { ttl: 60_000, limit: 3 } })
  @HttpCode(HttpStatus.CREATED)
  async register(@Body() body: RegisterDto) {
    return this.authService.register(body.email, body.password, body.name);
  }

  @Post("login")
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @HttpCode(HttpStatus.OK)
  async login(@Body() body: LoginBody) {
    const { email, password } = body;
    if (!email?.trim()) throw new BadRequestException("email is required");
    if (!password)      throw new BadRequestException("password is required");
    return this.authService.login(email.trim().toLowerCase(), password);
  }

  @Get("me")
  @SkipThrottle()
  @UseGuards(JwtAuthGuard)
  me(@Request() req: any) {
    return req.user; // set by JwtStrategy.validate()
  }

  @Get("me/usage")
  @SkipThrottle()
  @UseGuards(JwtAuthGuard)
  getMyUsage(@Request() req: any) {
    return this.authService.getMyUsage(req.user.id ?? req.user.sub);
  }

  @Get("users/:id")
  @UseGuards(JwtAuthGuard)
  async getUser(@Param("id") id: string) {
    const user = await this.authService.validateUser(id);
    if (!user) return { id, name: "Unknown" };
    return { id: user.id, name: user.name };
  }

  @Get("admin/users")
  @SkipThrottle()
  @UseGuards(JwtAuthGuard)
  async listUsers(@Request() req: any) {
    if (req.user.role !== "admin") throw new ForbiddenException("Admin only");
    return this.authService.listUsers();
  }

  @Patch("admin/users/:id/role")
  @UseGuards(JwtAuthGuard)
  async setRole(
    @Request() req: any,
    @Param("id") id: string,
    @Body("role") role: string,
  ) {
    if (req.user.role !== "admin") throw new ForbiddenException("Admin only");
    if (req.user.sub === id) throw new BadRequestException("Cannot change your own role");
    if (!["admin", "tester"].includes(role)) throw new BadRequestException("Invalid role");
    return this.authService.setRole(id, role as Role);
  }
}
