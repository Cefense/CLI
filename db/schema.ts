import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const cyberusProfiles = sqliteTable("cyberus_profiles", {
  email: text("email").primaryKey(),
  fullName: text("full_name"),
  company: text("company").notNull().default(""),
  plan: text("plan").notNull().default("signal"),
  stack: text("stack").notNull().default(""),
  repositoryUrl: text("repository_url").notNull().default(""),
  watchlist: text("watchlist").notNull().default("[]"),
  onboardingComplete: integer("onboarding_complete", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const cyberusActivity = sqliteTable("cyberus_activity", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ownerEmail: text("owner_email").notNull(),
  eventType: text("event_type").notNull(),
  summary: text("summary").notNull(),
  createdAt: text("created_at").notNull(),
});

export const cyberusScans = sqliteTable("cyberus_scans", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ownerEmail: text("owner_email").notNull(),
  repositoryUrl: text("repository_url").notNull(),
  repositoryName: text("repository_name").notNull(),
  defaultBranch: text("default_branch").notNull(),
  fileCount: integer("file_count").notNull(),
  sourceFilesChecked: integer("source_files_checked").notNull(),
  languages: text("languages").notNull().default("[]"),
  findings: text("findings").notNull().default("[]"),
  createdAt: text("created_at").notNull(),
});
