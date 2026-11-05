-- CreateTable
CREATE TABLE "ExchangeRate" (
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "currencyFrom" TEXT NOT NULL,
    "currencyTo" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "id" TEXT NOT NULL,
    "rate" DOUBLE PRECISION NOT NULL,
    "source" "DataSource" NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExchangeRate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ExchangeRate_date_idx" ON "ExchangeRate"("date");

-- CreateIndex
CREATE UNIQUE INDEX "ExchangeRate_currencyFrom_currencyTo_date_source_key" ON "ExchangeRate"("currencyFrom", "currencyTo", "date", "source");
