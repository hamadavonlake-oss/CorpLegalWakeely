import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './strategies/jwt.strategy';
import type { AuthProvider } from './auth-provider.interface';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: () => ({
        // Default signing options — AuthService overrides with RS256 keys
        secret: 'placeholder',
        signOptions: { algorithm: 'RS256' },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    {
      provide: 'AuthProvider',
      useExisting: AuthService,
    },
    AuthService,
    JwtStrategy,
  ],
  exports: [
    AuthService,
    {
      provide: 'AuthProvider',
      useExisting: AuthService,
    },
  ],
})
export class AuthModule {}