import {
  IsString,
  IsNotEmpty,
  IsOptional,
  MaxLength,
  IsArray,
  ArrayNotEmpty,
  IsIn,
} from "class-validator";

const ENVIRONMENTS = ["staging", "production", "dev", "qa", "uat"] as const;

export class CreateRunDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name: string;

  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  testCaseIds: string[];

  @IsString()
  @IsNotEmpty()
  environment: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  browser?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  buildVersion?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  device?: string;

  @IsOptional()
  @IsString()
  projectId?: string;
}
