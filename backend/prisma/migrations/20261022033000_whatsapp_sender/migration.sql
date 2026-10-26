-- AlterTable
ALTER TABLE `blast_logs` ADD COLUMN `campaign_id` INTEGER NULL,
    ADD COLUMN `provider_msg_id` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `devices` ADD COLUMN `consecutive_fails` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `daily_limit` INTEGER NOT NULL DEFAULT 200,
    ADD COLUMN `deleted_at` DATETIME(3) NULL,
    ADD COLUMN `link_method` VARCHAR(191) NULL,
    ADD COLUMN `sent_today` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `sent_today_date` DATETIME(3) NULL;

-- CreateTable
CREATE TABLE `blast_campaigns` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `title` VARCHAR(191) NOT NULL,
    `image_url` VARCHAR(191) NOT NULL,
    `caption` TEXT NOT NULL,
    `button_label` VARCHAR(191) NULL,
    `button_url` VARCHAR(191) NULL,
    `batch_id` INTEGER NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'draft',
    `start_at` DATETIME(3) NULL,
    `end_at` DATETIME(3) NULL,
    `created_by_id` INTEGER NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `campaign_participations` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NOT NULL,
    `campaign_id` INTEGER NOT NULL,
    `device_id` INTEGER NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'active',
    `joined_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `left_at` DATETIME(3) NULL,

    UNIQUE INDEX `campaign_participations_user_id_campaign_id_key`(`user_id`, `campaign_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `blast_tasks` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `campaign_id` INTEGER NOT NULL,
    `contact_id` INTEGER NOT NULL,
    `participation_id` INTEGER NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'pending',
    `error` TEXT NULL,
    `sent_at` DATETIME(3) NULL,
    `started_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `blast_tasks_campaign_id_status_idx`(`campaign_id`, `status`),
    UNIQUE INDEX `blast_tasks_campaign_id_contact_id_key`(`campaign_id`, `contact_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `blast_logs_campaign_id_idx` ON `blast_logs`(`campaign_id`);

-- CreateIndex
CREATE UNIQUE INDEX `devices_phone_key` ON `devices`(`phone`);

-- AddForeignKey
ALTER TABLE `blast_campaigns` ADD CONSTRAINT `blast_campaigns_batch_id_fkey` FOREIGN KEY (`batch_id`) REFERENCES `contact_batches`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `blast_campaigns` ADD CONSTRAINT `blast_campaigns_created_by_id_fkey` FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `campaign_participations` ADD CONSTRAINT `campaign_participations_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `campaign_participations` ADD CONSTRAINT `campaign_participations_campaign_id_fkey` FOREIGN KEY (`campaign_id`) REFERENCES `blast_campaigns`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `campaign_participations` ADD CONSTRAINT `campaign_participations_device_id_fkey` FOREIGN KEY (`device_id`) REFERENCES `devices`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `blast_tasks` ADD CONSTRAINT `blast_tasks_campaign_id_fkey` FOREIGN KEY (`campaign_id`) REFERENCES `blast_campaigns`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `blast_tasks` ADD CONSTRAINT `blast_tasks_contact_id_fkey` FOREIGN KEY (`contact_id`) REFERENCES `pool_contacts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `blast_tasks` ADD CONSTRAINT `blast_tasks_participation_id_fkey` FOREIGN KEY (`participation_id`) REFERENCES `campaign_participations`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `blast_logs` ADD CONSTRAINT `blast_logs_campaign_id_fkey` FOREIGN KEY (`campaign_id`) REFERENCES `blast_campaigns`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
