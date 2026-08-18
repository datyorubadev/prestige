"use client";
import { useParams } from "next/navigation";
import { CustomerDetail } from "@/components/customers/customer-detail";

export default function CustomerDetailPage() {
  const params = useParams();
  return <CustomerDetail customerId={params?.customerId as string} />;
}
