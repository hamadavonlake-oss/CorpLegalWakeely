import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { HealthController } from '../src/health/health.controller';
import { API_PREFIX } from '@glo/shared';

/**
 * Phase 0 smoke test: verify the NestJS application module compiles
 * and all providers (health indicators, config, etc.) can be instantiated.
 */
describe('App Module Bootstrap (Phase 0)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix(API_PREFIX);
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('application should bootstrap successfully', () => {
    expect(app).toBeDefined();
  });

  it('HealthController should be available via module', () => {
    const moduleRef = app.select(AppModule);
    const controller = moduleRef.get(HealthController);
    expect(controller).toBeDefined();
    expect(controller).toBeInstanceOf(HealthController);
  });
});
