-- AlterTable
ALTER TABLE `contact_categories` ADD COLUMN `is_active` BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE `category_stats` (
    `category_id` INTEGER NOT NULL,
    `total` INTEGER NOT NULL DEFAULT 0,
    `none` INTEGER NOT NULL DEFAULT 0,
    `queued` INTEGER NOT NULL DEFAULT 0,
    `active` INTEGER NOT NULL DEFAULT 0,
    `success` INTEGER NOT NULL DEFAULT 0,
    `failed` INTEGER NOT NULL DEFAULT 0,
    `opt_out` INTEGER NOT NULL DEFAULT 0,
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`category_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `category_stats` ADD CONSTRAINT `category_stats_category_id_fkey` FOREIGN KEY (`category_id`) REFERENCES `contact_categories`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
