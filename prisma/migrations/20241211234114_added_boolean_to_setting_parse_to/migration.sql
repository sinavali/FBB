-- AlterTable
ALTER TABLE `Setting` MODIFY `parseTo` ENUM('Int', 'Float', 'BigInt', 'String', 'Boolean') NOT NULL;
