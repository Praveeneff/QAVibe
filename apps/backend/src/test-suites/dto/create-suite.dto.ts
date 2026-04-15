import { IsString, IsNotEmpty, IsOptional, MaxLength, IsUUID } from "class-validator";

export class CreateSuiteDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsOptional()
  @IsString()
  @IsUUID()
  parentId?: string;
}
