CREATE INDEX "beneficial_owner_investor" ON "investor"."beneficial_owner" USING btree ("investor_id");--> statement-breakpoint
CREATE INDEX "compliance_comment_investor" ON "investor"."compliance_comment" USING btree ("investor_id","created_at");--> statement-breakpoint
CREATE INDEX "investor_representative_investor" ON "investor"."investor_representative" USING btree ("investor_id");--> statement-breakpoint
CREATE INDEX "investor_invitation_investor" ON "issuance"."investor_invitation" USING btree ("investor_id");--> statement-breakpoint
CREATE INDEX "allocation_subscription" ON "registry"."allocation" USING btree ("subscription_id");--> statement-breakpoint
CREATE INDEX "logical_account_investor" ON "registry"."logical_account" USING btree ("investor_id");--> statement-breakpoint
CREATE INDEX "registry_snapshot_issuance" ON "registry"."registry_snapshot" USING btree ("issuance_id","record_date");--> statement-breakpoint
CREATE INDEX "transfer_request_to" ON "registry"."transfer_request" USING btree ("tenant_id","to_investor_id");