-- AlterTable
ALTER TABLE `blast_campaigns` ADD COLUMN `category_id` INTEGER NULL,
    ADD COLUMN `delivered_count` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `ended_at` DATETIME(3) NULL,
    ADD COLUMN `failed_count` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `read_count` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `sent_count` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `started_at` DATETIME(3) NULL,
    ADD COLUMN `template_id` INTEGER NULL,
    ADD COLUMN `total_target` INTEGER NOT NULL DEFAULT 0,
    MODIFY `image_url` VARCHAR(191) NULL,
    MODIFY `batch_id` INTEGER NULL;

-- CreateTable
CREATE TABLE `contact_categories` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(191) NOT NULL,
    `country_code` VARCHAR(191) NULL,
    `rate_per_message` INTEGER NOT NULL DEFAULT 0,
    `total_contacts` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `contact_categories_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `targets` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `category_id` INTEGER NOT NULL,
    `phone` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NULL,
    `queue_status` VARCHAR(191) NOT NULL DEFAULT 'none',
    `consent_source` VARCHAR(191) NOT NULL,
    `opt_out` BOOLEAN NOT NULL DEFAULT false,
    `last_error` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `targets_phone_key`(`phone`),
    INDEX `targets_category_id_queue_status_id_idx`(`category_id`, `queue_status`, `id`),
    INDEX `targets_queue_status_idx`(`queue_status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `message_templates` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(191) NOT NULL,
    `body` TEXT NOT NULL,
    `image_url` VARCHAR(191) NULL,
    `button_label` VARCHAR(191) NULL,
    `button_url` VARCHAR(191) NULL,
    `created_by_id` INTEGER NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `message_events` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `campaign_id` INTEGER NOT NULL,
    `task_id` INTEGER NULL,
    `provider_msg_id` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NOT NULL,
    `at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `message_events_campaign_id_status_idx`(`campaign_id`, `status`),
    UNIQUE INDEX `message_events_provider_msg_id_status_key`(`provider_msg_id`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `backup_files` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `type` VARCHAR(191) NOT NULL,
    `file_path` VARCHAR(191) NOT NULL,
    `size_bytes` BIGINT NOT NULL DEFAULT 0,
    `sha256` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'completed',
    `created_by_id` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `risk_acks` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NOT NULL,
    `version` VARCHAR(191) NOT NULL,
    `accepted_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `ip` VARCHAR(191) NULL,

    INDEX `risk_acks_user_id_idx`(`user_id`),
    UNIQUE INDEX `risk_acks_user_id_version_key`(`user_id`, `version`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `blast_campaigns` ADD CONSTRAINT `blast_campaigns_category_id_fkey` FOREIGN KEY (`category_id`) REFERENCES `contact_categories`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `blast_campaigns` ADD CONSTRAINT `blast_campaigns_template_id_fkey` FOREIGN KEY (`template_id`) REFERENCES `message_templates`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `targets` ADD CONSTRAINT `targets_category_id_fkey` FOREIGN KEY (`category_id`) REFERENCES `contact_categories`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `message_templates` ADD CONSTRAINT `message_templates_created_by_id_fkey` FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `message_events` ADD CONSTRAINT `message_events_campaign_id_fkey` FOREIGN KEY (`campaign_id`) REFERENCES `blast_campaigns`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `message_events` ADD CONSTRAINT `message_events_task_id_fkey` FOREIGN KEY (`task_id`) REFERENCES `blast_tasks`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `backup_files` ADD CONSTRAINT `backup_files_created_by_id_fkey` FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `risk_acks` ADD CONSTRAINT `risk_acks_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
