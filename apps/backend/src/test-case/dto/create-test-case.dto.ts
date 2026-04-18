import {
  IsString,
  IsNotEmpty,
  IsOptional,
  MaxLength,
  IsIn,
} from "class-validator";

const CATEGORIES      = ["smoke", "sanity", "regression", "functional", "e2e", "integration", "performance", "security", "ui", "api"] as const;
const EXECUTION_TYPES = ["manual", "automated", "api", "exploratory"] as const;
const PRIORITIES      = ["P1", "P2", "P3", "P4"] as const;
const SEVERITIES      = ["critical", "high", "medium", "low"] as const;
const STATUSES        = ["active", "inactive", "draft"] as const;

export class CreateTestCaseDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  title: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsIn(CATEGORIES)
  category?: string;

  @IsOptional()
  @IsIn(EXECUTION_TYPES)
  executionType?: string;

  @IsOptional()
  @IsIn(PRIORITIES)
  priority?: string;

  @IsOptional()
  @IsIn(SEVERITIES)
  severity?: string;

  @IsOptional()
  @IsString()
  steps?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  expectedResult?: string;

  @IsOptional()
  @IsIn(STATUSES)
  status?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  preconditions?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  tags?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  automationId?: string;

  @IsOptional()
  @IsString()
  suiteId?: string | null;

  @IsOptional()
  @IsString()
  projectId?: string;
}
