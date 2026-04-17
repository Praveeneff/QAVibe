import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  HttpCode,
  HttpStatus,
  UseGuards,
} from "@nestjs/common";
import { TestSuitesService } from "./test-suites.service";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CreateSuiteDto } from "./dto/create-suite.dto";
import { UpdateSuiteDto } from "./dto/update-suite.dto";

@Controller()
export class TestSuitesController {
  constructor(private readonly testSuitesService: TestSuitesService) {}

  @Get("test-suites")
  getAllSuites(@Query("projectId") projectId?: string) {
    return this.testSuitesService.getAllSuites(projectId);
  }

  @Post("test-suites")
  @UseGuards(JwtAuthGuard)
  createSuite(@Body() body: CreateSuiteDto) {
    return this.testSuitesService.createSuite(body.name, body.description, body.parentId, body.projectId);
  }

  @Patch("test-suites/:id")
  @UseGuards(JwtAuthGuard)
  updateSuite(
    @Param("id") id: string,
    @Body() body: UpdateSuiteDto,
  ) {
    return this.testSuitesService.updateSuite(id, body.name, body.description);
  }

  @Delete("test-suites/:id")
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteSuite(@Param("id") id: string) {
    return this.testSuitesService.deleteSuite(id);
  }

  @Patch("test-suites/:id/assign/:testCaseId")
  @UseGuards(JwtAuthGuard)
  assignCase(
    @Param("id") suiteId: string,
    @Param("testCaseId") testCaseId: string,
  ) {
    return this.testSuitesService.assignCase(suiteId, testCaseId);
  }

  @Patch("test-cases/:id/remove-suite")
  @UseGuards(JwtAuthGuard)
  removeFromSuite(@Param("id") testCaseId: string) {
    return this.testSuitesService.removeFromSuite(testCaseId);
  }
}
