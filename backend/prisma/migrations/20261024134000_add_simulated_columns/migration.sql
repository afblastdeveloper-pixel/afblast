-- AlterTable
ALTER TABLE `contact_categories` ADD COLUMN `is_simulated` BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE `targets` ADD COLUMN `is_simulated` BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE `blast_campaigns` ADD COLUMN `is_simulated` BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE `devices` ADD COLUMN `is_simulated` BOOLEAN NOT NULL DEFAULT false;
