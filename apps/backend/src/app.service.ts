import { Injectable } from "@nestjs/common";
import type { ApiResponse } from "@qavibe/shared-types";

@Injectable()
export class AppService {
  getStatus(): ApiResponse<string> {
    return {
      data: "QAVibe backend is running",
      success: true,
    };
  }
}
