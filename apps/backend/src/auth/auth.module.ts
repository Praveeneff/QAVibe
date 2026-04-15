import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { JwtStrategy } from "./jwt.strategy";

if (!process.env.JWT_SECRET) {
  throw new Error("JWT_SECRET environment variable is not set — cannot start auth module");
}

@Module({
  imports: [
    PassportModule,
    JwtModule.register({
      secret:      process.env.JWT_SECRET,
      signOptions: { expiresIn: "7d" },
    }),
  ],
  controllers: [AuthController],
  providers:   [AuthService, JwtStrategy],
  exports:     [AuthService, JwtModule],   // export JwtModule so other modules can use JwtAuthGuard
})
export class AuthModule {}
