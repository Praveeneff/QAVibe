import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({
    origin: "http://localhost:3000",
    methods: "GET,POST,PUT,PATCH,DELETE,OPTIONS",
    allowedHeaders: "*",
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,        // strip unknown fields
      forbidNonWhitelisted: false, // don't reject — just strip (safer during dev)
      transform: true,        // auto-convert primitives (e.g. "123" → 123)
    }),
  );
  await app.listen(3001);
  console.log("Backend running on http://localhost:3001");
}

bootstrap();
