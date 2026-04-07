import { Controller, Get } from "@nestjs/common";
import { AppService } from "./app.service";
import type { ApiResponse } from "@qavibe/shared-types";

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getStatus(): ApiResponse<string> {
    return this.appService.getStatus();
  }
}
