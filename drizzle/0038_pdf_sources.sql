CREATE TABLE "pdf_sources" (
	"document_id" uuid PRIMARY KEY NOT NULL,
	"docx" "bytea" NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pdf_sources" ADD CONSTRAINT "pdf_sources_document_id_generated_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."generated_documents"("id") ON DELETE cascade ON UPDATE no action;