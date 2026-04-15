import { IsString, IsNotEmpty, IsOptional, IsIn, MaxLength } from "class-validator";

const RESULT_STATUSES = ["pending", "pass", "fail", "blocked", "skip"] as const;

export class UpdateResultDto {
  @IsString()
  @IsIn(RESULT_STATUSES)
  status: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @IsOptional()
  @IsString()
  screenshotUrl?: string;
}
