import { IsEmail, IsString, MinLength, IsNotEmpty } from 'class-validator';
import { Transform } from 'class-transformer';

export class RegisterDto {
  @IsEmail({}, { message: 'A valid email address is required' })
  @Transform(({ value }) => value?.trim().toLowerCase())
  email: string;

  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  password: string;

  @IsString()
  @IsNotEmpty({ message: 'Name cannot be blank' })
  @Transform(({ value }) => value?.trim())
  name: string;
}
