CREATE INDEX "device_photos_device_id_idx" ON "device_photos" USING btree ("device_id");--> statement-breakpoint
CREATE INDEX "stock_movements_product_idx" ON "stock_movements" USING btree ("product_type","product_id");--> statement-breakpoint
CREATE INDEX "payments_sale_id_idx" ON "payments" USING btree ("sale_id");--> statement-breakpoint
CREATE INDEX "sale_attachments_sale_id_idx" ON "sale_attachments" USING btree ("sale_id");--> statement-breakpoint
CREATE INDEX "sale_items_sale_id_idx" ON "sale_items" USING btree ("sale_id");--> statement-breakpoint
CREATE INDEX "sales_customer_id_idx" ON "sales" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "sales_created_at_idx" ON "sales" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "trade_ins_sale_id_idx" ON "trade_ins" USING btree ("sale_id");--> statement-breakpoint
CREATE INDEX "lead_tasks_lead_id_idx" ON "lead_tasks" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX "leads_owner_id_idx" ON "leads" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "leads_status_idx" ON "leads" USING btree ("status");--> statement-breakpoint
CREATE INDEX "accounts_receivable_sale_id_idx" ON "accounts_receivable" USING btree ("sale_id");--> statement-breakpoint
CREATE INDEX "accounts_receivable_customer_id_idx" ON "accounts_receivable" USING btree ("customer_id");