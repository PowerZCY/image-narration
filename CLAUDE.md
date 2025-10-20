# CLAUDE.md
1

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Architecture Overview

This is a Next.js 15 application for AI-powered image narration with multi-language support. The app uses:

- **Frontend**: Next.js 15 with React 19, Tailwind CSS, Fumadocs for documentation
- **Authentication**: Clerk for user management
- **AI Services**: OpenRouter API for image analysis and text translation
- **Content Management**: MDX files with Fumadocs for blog and legal pages
- **Storage**: Cloudflare R2 for image uploads
- **i18n**: next-intl for internationalization
- **UI Components**: Custom windrun-huaiin component library + Radix UI

## Key Configuration Files

- `src/lib/appConfig.ts`: Centralized app configuration with environment variables
- `dev-scripts.config.json`: Development tooling configuration for blog generation and i18n
- `next.config.ts`: Next.js configuration with MDX and internationalization setup

## Common Development Commands

```bash
# Development
pnpm dev                    # Start development server with turbopack
pnpm predev                 # Runs lint before dev (automatically called)

# Building
pnpm build                  # Full production build (generates blog index first)
pnpm build:dev             # Development build (generates blog index first)
pnpm build:prod            # Production build only

# Code Quality
pnpm lint                   # Next.js ESLint
next lint                   # Direct ESLint command

# Blog Management
pnpm generate-blog-index    # Generate blog index from MDX files in src/mdx/blog

# Translation Management
pnpm check-translations     # Verify translation completeness
pnpm clean-translations     # Clean unused translations
pnpm remove-translations    # Remove translations (clean with --remove flag)

# Development Tools
pnpm deep-clean            # Deep clean node_modules and build artifacts
pnpm d8                    # Alias for deep-clean
pnpm whoareyou            # Generate Next.js architecture documentation

# Package Management
pnpm windrun              # Update all @windrun-huaiin packages to latest
```

## Project Structure

- `src/app/[locale]/`: Internationalized app router pages
- `src/app/api/ai-generate/`: AI image narration and translation endpoints
- `src/components/`: Reusable React components
- `src/lib/`: Configuration files and utilities
- `src/mdx/blog/`: Blog content in MDX format
- `src/mdx/legal/`: Legal pages in MDX format
- `messages/`: Translation files for i18n

## API Endpoints

- `POST /api/ai-generate`: Generate image narration from image URL + optional prompt
- `PUT /api/ai-generate`: Translate text to supported languages (English, Japanese, Spanish, Chinese)

## Environment Variables

Key environment variables (see `src/lib/appConfig.ts`):
- `OPENROUTER_API_KEY`: OpenRouter API key for AI services
- `NEXT_PUBLIC_OPENROUTER_MODEL_NAME`: Model for image narration
- `NEXT_PUBLIC_OPENROUTER_TRANSLATION_MODEL_NAME`: Model for translation (default: deepseek)
- `OPENROUTER_ENABLE_MOCK`: Enable mock responses for development
- `NEXT_PUBLIC_R2_*`: Cloudflare R2 configuration for image storage

## Mock System

The app includes comprehensive mock functionality for development:
- Image narration mocking via `OPENROUTER_ENABLE_MOCK`
- Configurable mock timeouts and error simulation
- R2 storage mocking for image uploads

## Custom Development Scripts

Uses `@windrun-huaiin/dev-scripts` for:
- Blog index generation from MDX files
- Translation management and validation
- Architecture documentation generation
- Deep cleaning of build artifacts

## Testing

Currently no test framework is configured. When adding tests, check if the project needs specific test commands added to package.json.

## Important Notes

- Always run `pnpm generate-blog-index` before building for production
- The app uses a custom patch for `fumadocs-ui@15.3.3`
- Path aliases: `@/*` maps to `src/*`, `.source/*` maps to `.source/*`
- Image uploads are limited to 5MB by default (configurable via R2_UPLOAD_IMAGE_MAX_SIZE)