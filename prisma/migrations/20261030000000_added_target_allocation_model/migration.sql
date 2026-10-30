-- CreateTable
CREATE TABLE "TargetAllocationModel" (
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "parameters" JSONB NOT NULL DEFAULT '{}',
    "targets" JSONB NOT NULL DEFAULT '{}',
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "TargetAllocationModel_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TargetAllocationModel_userId_idx" ON "TargetAllocationModel"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "TargetAllocationModel_userId_name_key" ON "TargetAllocationModel"("userId", "name");

-- AddForeignKey
ALTER TABLE "TargetAllocationModel" ADD CONSTRAINT "TargetAllocationModel_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
