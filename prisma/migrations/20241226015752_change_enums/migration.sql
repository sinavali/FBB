/*
  Warnings:

  - The values [Int,Float,BigInt,String,Boolean] on the enum `Setting_parseTo` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the column `sessionId` on the `WorkTime` table. All the data in the column will be lost.
  - You are about to drop the `TimeMicro` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE `TimeMicro` DROP FOREIGN KEY `TimeMicro_sessionId_fkey`;

-- DropForeignKey
ALTER TABLE `TimeMicro` DROP FOREIGN KEY `TimeMicro_workTimeId_fkey`;

-- DropForeignKey
ALTER TABLE `WorkTime` DROP FOREIGN KEY `WorkTime_sessionId_fkey`;

-- DropIndex
DROP INDEX `WorkTime_sessionId_fkey` ON `WorkTime`;

-- AlterTable
ALTER TABLE `Setting` MODIFY `parseTo` ENUM('INT', 'FLOAT', 'STRING', 'BOOLEAN') NOT NULL;

-- AlterTable
ALTER TABLE `WorkTime` DROP COLUMN `sessionId`;

-- DropTable
DROP TABLE `TimeMicro`;
