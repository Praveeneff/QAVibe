import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  UseGuards,
  Request,
  BadRequestException,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
import { AuthService } from "./auth.service";
import { JwtAuthGuard } from "./jwt-auth.guard";
import { RegisterDto } from "./register.dto";

interface LoginBody { email: string; password: string; }

@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post("register")
  @HttpCode(HttpStatus.CREATED)
  async register(@Body() body: RegisterDto) {
    return this.authService.register(body.email, body.password, body.name);
  }

  @Post("login")
  @HttpCode(HttpStatus.OK)
  async login(@Body() body: LoginBody) {
    const { email, password } = body;
    if (!email?.trim()) throw new BadRequestException("email is required");
    if (!password)      throw new BadRequestException("password is required");
    return this.authService.login(email.trim().toLowerCase(), password);
  }

  @Get("me")
  @UseGuards(JwtAuthGuard)
  me(@Request() req: any) {
    return req.user; // set by JwtStrategy.validate()
  }

  @Get("users/:id")
  @UseGuards(JwtAuthGuard)
  async getUser(@Param("id") id: string) {
    const user = await this.authService.validateUser(id);
    if (!user) return { id, name: "Unknown", email: "", role: "" };
    return { id: user.id, name: user.name, email: user.email, role: user.role };
  }
}
