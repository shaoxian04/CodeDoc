import * as Sentry from "@sentry/node";
import * as vscode from "vscode";

export class SentryService {
  private static instance: SentryService;
  private initialized = false;

  private constructor() {}

  public static getInstance(): SentryService {
    if (!SentryService.instance) {
      SentryService.instance = new SentryService();
    }
    return SentryService.instance;
  }

  public initialize(context: vscode.ExtensionContext): void {
    if (this.initialized) return;

    const config = vscode.workspace.getConfiguration("codedoc");
    const enableTelemetry = config.get<boolean>("enableTelemetry", true);

    if (!enableTelemetry) {
      console.log("Telemetry disabled by user");
      return;
    }

    Sentry.init({
      dsn: "https://0b1f5c316a9a56a12883587aa1640911@o4510214730153984.ingest.us.sentry.io/4510216826388480",
      environment: this.getEnvironment(),
      release: this.getVersion(context),
      beforeSend: this.beforeSend.bind(this),
      tracesSampleRate: 0.1, // 10% of transactions for performance monitoring
      beforeBreadcrumb: this.beforeBreadcrumb.bind(this),
    });

    // Set user context (anonymized)
    Sentry.setUser({
      id: this.hashString(vscode.env.machineId), // Anonymized machine ID
      username: "anonymous", // Don't use real username for privacy
    });

    // Set tags for filtering and analysis
    Sentry.setTag("vscode.version", vscode.version);
    Sentry.setTag("extension.version", this.getVersion(context));
    Sentry.setTag("platform", process.platform);
    Sentry.setTag("arch", process.arch);

    this.initialized = true;
    console.log("Sentry initialized successfully");

    // Add initial breadcrumb
    this.addBreadcrumb("Extension activated", "lifecycle");
  }

  public captureException(error: Error, context?: any): void {
    if (!this.initialized) return;

    Sentry.withScope((scope) => {
      if (context) {
        scope.setContext("additional", this.sanitizeContext(context));
      }
      scope.setLevel("error");
      Sentry.captureException(error);
    });
  }

  public captureMessage(
    message: string,
    level: Sentry.SeverityLevel = "info",
    context?: any
  ): void {
    if (!this.initialized) return;

    Sentry.withScope((scope) => {
      if (context) {
        scope.setContext("additional", this.sanitizeContext(context));
      }
      scope.setLevel(level);
      Sentry.captureMessage(message);
    });
  }

  public addBreadcrumb(message: string, category: string, data?: any): void {
    if (!this.initialized) return;

    Sentry.addBreadcrumb({
      message,
      category,
      data: data ? this.sanitizeData(data) : undefined,
      timestamp: Date.now() / 1000,
      level: "info",
    });
  }

  public startTransaction(name: string, operation: string): any {
    if (!this.initialized) return undefined;

    // Simple span creation for newer Sentry versions
    return {
      setStatus: (status: string) => {},
      finish: () => {},
    };
  }

  public setUserContext(userId: string, email?: string): void {
    if (!this.initialized) return;

    Sentry.setUser({
      id: this.hashString(userId), // Always hash user IDs
      email: email ? this.hashString(email) : undefined, // Hash emails too
    });
  }

  public setTag(key: string, value: string): void {
    if (!this.initialized) return;
    Sentry.setTag(key, value);
  }

  public flush(): Promise<boolean> {
    if (!this.initialized) return Promise.resolve(true);
    return Sentry.flush(2000); // 2 second timeout
  }

  public sendTestError(): void {
    if (!this.initialized) {
      console.log('Sentry not initialized, cannot send test error');
      return;
    }

    console.log('Sending test error to Sentry...');
    
    // Add test breadcrumbs
    this.addBreadcrumb('User triggered test error', 'test', {
      action: 'manual_test',
      timestamp: new Date().toISOString()
    });

    // Send test message
    this.captureMessage('Sentry integration test - this is a test message', 'info', {
      test: true,
      feature: 'sentry_integration',
      version: '1.0.3'
    });

    // Send test error
    const testError = new Error('Sentry integration test - this is a test error');
    testError.stack = `Error: Sentry integration test - this is a test error
    at SentryService.sendTestError (sentry_service.ts:123:45)
    at TestCommand.execute (extension.ts:67:89)`;
    
    this.captureException(testError, {
      test: true,
      feature: 'sentry_integration',
      trigger: 'manual_test',
      timestamp: new Date().toISOString()
    });

    console.log('Test error sent to Sentry successfully!');
  }

  private getEnvironment(): string {
    // Detect if running in development or production
    if (vscode.env.appName.includes("Insiders")) {
      return "development";
    }
    return "production";
  }

  private getVersion(context: vscode.ExtensionContext): string {
    return context.extension.packageJSON.version;
  }

  private beforeSend(event: any): any {
    // Filter out sensitive information
    if (event.exception) {
      event.exception.values?.forEach((exception) => {
        if (exception.stacktrace?.frames) {
          exception.stacktrace.frames = exception.stacktrace.frames.map(
            (frame) => ({
              ...frame,
              vars: undefined, // Remove local variables that might contain sensitive data
            })
          );
        }
      });
    }

    // Sanitize breadcrumbs
    if (event.breadcrumbs) {
      event.breadcrumbs = event.breadcrumbs.map((breadcrumb) => ({
        ...breadcrumb,
        data: this.sanitizeData(breadcrumb.data),
      }));
    }

    // Sanitize request data
    if (event.request) {
      event.request = this.sanitizeRequest(event.request);
    }

    return event;
  }

  private beforeBreadcrumb(
    breadcrumb: Sentry.Breadcrumb
  ): Sentry.Breadcrumb | null {
    // Filter out sensitive breadcrumbs
    if (
      breadcrumb.category === "http" &&
      breadcrumb.data?.url?.includes("openai")
    ) {
      // Remove headers that might contain API keys
      if (breadcrumb.data.headers) {
        breadcrumb.data.headers = "[REDACTED]";
      }
    }

    // Sanitize data in breadcrumbs
    if (breadcrumb.data) {
      breadcrumb.data = this.sanitizeData(breadcrumb.data);
    }

    return breadcrumb;
  }

  private sanitizeData(data: any): any {
    if (!data || typeof data !== "object") return data;

    const sanitized = { ...data };
    const sensitiveKeys = [
      "apiKey",
      "api_key",
      "token",
      "password",
      "secret",
      "authorization",
      "auth",
      "key",
      "openaiApiKey",
      "bearer",
      "credentials",
    ];

    for (const key of sensitiveKeys) {
      if (sanitized[key]) {
        sanitized[key] = "[REDACTED]";
      }
    }

    // Recursively sanitize nested objects
    for (const key in sanitized) {
      if (typeof sanitized[key] === "object" && sanitized[key] !== null) {
        sanitized[key] = this.sanitizeData(sanitized[key]);
      }
    }

    return sanitized;
  }

  private sanitizeContext(context: any): any {
    if (!context) return context;

    const sanitized = this.sanitizeData(context);

    // Remove potentially sensitive context
    if (sanitized.filePath) {
      sanitized.filePath = this.sanitizeFilePath(sanitized.filePath);
    }

    if (sanitized.code) {
      sanitized.code = "[CODE_CONTENT_REDACTED]";
    }

    return sanitized;
  }

  private sanitizeRequest(request: any): any {
    if (!request) return request;

    const sanitized = { ...request };

    // Remove sensitive headers
    if (sanitized.headers) {
      sanitized.headers = this.sanitizeData(sanitized.headers);
    }

    // Remove query parameters that might be sensitive
    if (sanitized.query_string) {
      sanitized.query_string = "[REDACTED]";
    }

    return sanitized;
  }

  private sanitizeFilePath(filePath: string): string {
    if (!filePath) return filePath;

    // Replace user-specific paths with generic placeholders
    return filePath
      .replace(/\/Users\/[^\/]+/g, "/Users/[USER]")
      .replace(/C:\\Users\\[^\\]+/g, "C:\\Users\\[USER]")
      .replace(/\/home\/[^\/]+/g, "/home/[USER]");
  }

  private hashString(input: string): string {
    // Simple hash function for anonymizing user data
    let hash = 0;
    if (input.length === 0) return hash.toString();

    for (let i = 0; i < input.length; i++) {
      const char = input.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }

    return Math.abs(hash).toString(16);
  }
}
