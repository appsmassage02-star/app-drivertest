# مرجع OpenAPI المستخرج لقاعدة بيانات Supabase (Data API)

- **نقطة الوصول (Host):** `itbfqpjwgjvvybffunkm.supabase.co`
- **بروتوكول الواجهة:** PostgREST / OpenAPI Specification
- **تاريخ الاستخراج:** 2026-10-20T00:15:53.570Z
- **طريقة الاستخراج:** طلب خادم خلفي آمن مع ترويسة المصادقة المعتمدة (بدون تمرير المفتاح في URL أو المتصفح).
- **إجمالي الجداول والـ Views المكتشفة:** 48
- **إجمالي دوال RPC المكتشفة:** 50

---

## 1. ما تم كشفه عبر مواصفة OpenAPI
تسمح مواصفة PostgREST OpenAPI الرسمية بالتعرف على كافة الموارد العامة المكشوفة للعميل:
1. الجداول والقوائم (Tables & Views) المتاحة للاستعلام والإدراج والتحديث.
2. أسماء الأعمدة الدقيقة، أنواع البيانات (Data Types)، وحالة الإلزام (Required / Nullable).
3. دوال الـ RPC المعلنة، أسماء معاملاتها (Parameters)، وأنواع القيم المعادة.

---

## 2. ما لا تستطيع مواصفة OpenAPI كشفه بطبيعتها (حدود المواصفة)
تقتصر مواصفة OpenAPI على واجهة العقد (Contract/Schema Interface) ولا يمكنها كشف التفاصيل الداخلية التالية:
- **كود الدوال الداخلي (Function Body / PLpgSQL Code):** لا يظهر منطق التحقق الداخلي المكتوب داخل PostgreSQL.
- **مشغلات الأحداث (Triggers):** لا تكشف OpenAPI الـ Triggers المنفذة تلقائياً في الخلفية داخل قاعدة البيانات.
- **سياسات أمان الصفوف الكاملة (RLS Policies):** لا تكشف تعابير `USING` أو `WITH CHECK` المكتوبة في SQL، بل تكتفي بتحديد ما إذا كان المسار متاحاً للـ Role الحالي.
- **فهارس الأداء المخصصة (Custom Indexes):** لا تظهر الفهارس غير الفريدة (مثل B-tree indexes) داخل OpenAPI.
*(ملاحظة: لمعرفة هذه العناصر الخمسة دون تخمين، يتطلب الأمر فحص فهارس نظام PostgreSQL `pg_catalog` في مرحلة لاحقة عبر جلسة قراءة فقط).*

---

## 3. قائمة دوال RPC المكتشفة ومعاملاتها

| اسم الدالة (RPC) | طريقة HTTP | المعاملات (Parameters) | نوع القيمة المعادة |
| :--- | :--- | :--- | :--- |
| **`accept_delivery_order`** | `POST` | `p_order_id`: string * | `void` |
| **`admin_approve_driver`** | `POST` | `p_driver_id`: string * | `void` |
| **`admin_decide_cancellation`** | `POST` | `p_approve`: boolean *, `p_decision_note`: string, `p_order_id`: string * | `void` |
| **`admin_reject_driver`** | `POST` | `p_driver_id`: string *, `p_rejection_reason`: string * | `void` |
| **`admin_resolve_cancellation`** | `POST` | `p_admin_notes`: string, `p_approve`: boolean *, `p_order_id`: string * | `void` |
| **`admin_set_governorate_delivery`** | `POST` | `p_delivery_fee`: number *, `p_governorate_code`: string *, `p_is_active`: boolean * | `void` |
| **`admin_toggle_driver_active`** | `POST` | `p_driver_id`: string *, `p_is_active`: boolean * | `void` |
| **`complete_delivery_order`** | `POST` | `p_order_id`: string * | `void` |
| **`driver_complete_shopping`** | `POST` | `p_order_id`: string * | `void` |
| **`driver_start_shopping`** | `POST` | `p_order_id`: string * | `void` |
| **`driver_update_delivery_item`** | `POST` | `p_actual_unit_price`: number, `p_item_id`: string *, `p_item_status`: string *, `p_missing_reason`: string | `void` |
| **`get_current_driver_id`** | `POST` | — | `void` |
| **`get_effective_delivery_fee`** | `POST` | `p_governorate_code`: string * | `void` |
| **`increment_app_asset_version`** | `POST` | `p_app_key`: string *, `p_asset_type`: string * | `void` |
| **`is_admin`** | `POST` | `user_id_param`: string * | `void` |
| **`is_household_admin`** | `POST` | `lookup_household_id`: string * | `void` |
| **`is_household_member`** | `POST` | `lookup_household_id`: string * | `void` |
| **`is_super_admin`** | `POST` | `user_id_param`: string * | `void` |
| **`pharmacy_admin_assign_driver`** | `POST` | `p_driver_id`: string *, `p_order_id`: string * | `void` |
| **`pharmacy_admin_decide_driver_cancel`** | `POST` | `p_decision`: string *, `p_note`: string, `p_order_id`: string * | `void` |
| **`pharmacy_create_order`** | `POST` | `p_address_center_name`: string *, `p_address_governorate_code`: string *, `p_address_governorate_name`: string *, `p_address_latitude`: number *, `p_address_longitude`: number *, `p_address_text`: string *, `p_customer_notes`: string, `p_files`: jsonb, `p_items`: jsonb, `p_order_id`: string *, `p_prescription_title`: string *, `p_requested_pharmacy_id`: string, `p_requested_pharmacy_name`: string, `p_saved_prescription_id`: string, `p_source_address_id`: string * | `void` |
| **`pharmacy_current_driver_id`** | `POST` | — | `void` |
| **`pharmacy_customer_add_item`** | `POST` | `p_item_name`: string *, `p_order_id`: string *, `p_quantity`: number *, `p_sort_order`: integer, `p_unit`: string * | `void` |
| **`pharmacy_customer_add_order_file`** | `POST` | `p_display_order`: integer *, `p_mime_type`: string, `p_order_id`: string *, `p_storage_path`: string * | `void` |
| **`pharmacy_customer_archive_order`** | `POST` | `p_order_id`: string * | `void` |
| **`pharmacy_customer_cancel_order`** | `POST` | `p_order_id`: string * | `void` |
| **`pharmacy_customer_change_item_quantity`** | `POST` | `p_item_id`: string *, `p_new_quantity`: number * | `void` |
| **`pharmacy_customer_change_pharmacy`** | `POST` | `p_order_id`: string *, `p_pharmacy_id`: string, `p_pharmacy_name`: string | `void` |
| **`pharmacy_customer_remove_item`** | `POST` | `p_item_id`: string * | `void` |
| **`pharmacy_customer_remove_order_file`** | `POST` | `p_file_id`: string * | `void` |
| **`pharmacy_driver_accept_order`** | `POST` | `p_order_id`: string * | `void` |
| **`pharmacy_driver_add_pharmacy_stop`** | `POST` | `p_internal_note`: string, `p_order_id`: string *, `p_pharmacy_id`: string *, `p_stop_status`: string | `void` |
| **`pharmacy_driver_add_receipt`** | `POST` | `p_mime_type`: string, `p_order_id`: string *, `p_storage_path`: string * | `void` |
| **`pharmacy_driver_can_view_order`** | `POST` | `p_order_id`: string * | `void` |
| **`pharmacy_driver_complete_delivery`** | `POST` | `p_order_id`: string * | `void` |
| **`pharmacy_driver_finish_shopping`** | `POST` | `p_medicines_total`: number *, `p_order_id`: string * | `void` |
| **`pharmacy_driver_mark_customer_contacted`** | `POST` | `p_order_id`: string * | `void` |
| **`pharmacy_driver_owns_order`** | `POST` | `p_order_id`: string * | `void` |
| **`pharmacy_driver_request_cancel`** | `POST` | `p_order_id`: string *, `p_reason`: string * | `void` |
| **`pharmacy_driver_start_delivery`** | `POST` | `p_order_id`: string * | `void` |
| **`pharmacy_driver_start_shopping`** | `POST` | `p_order_id`: string * | `void` |
| **`pharmacy_driver_update_image_note`** | `POST` | `p_file_id`: string *, `p_note`: string * | `void` |
| **`pharmacy_driver_update_item`** | `POST` | `p_driver_note`: string, `p_item_id`: string *, `p_purchased_quantity`: number *, `p_shortage_reason`: string | `void` |
| **`pharmacy_generate_order_number`** | `POST` | — | `void` |
| **`pharmacy_is_admin`** | `POST` | — | `void` |
| **`pharmacy_save_user_pharmacy`** | `POST` | `p_address`: string, `p_center_name`: string, `p_governorate_code`: string, `p_governorate_name`: string, `p_latitude`: number, `p_longitude`: number, `p_pharmacy_id`: string, `p_pharmacy_name`: string *, `p_phone`: string | `void` |
| **`record_admin_notification_view`** | `POST` | `p_device_role`: string, `p_household_id`: string *, `p_is_dismiss`: boolean, `p_notification_id`: string * | `void` |
| **`request_order_cancellation`** | `POST` | `p_order_id`: string *, `p_reason`: string * | `void` |
| **`toggle_delivery_service`** | `POST` | `p_default_fee`: number, `p_enabled`: boolean * | `void` |
| **`update_my_driver_profile`** | `POST` | `p_governorate_code`: string, `p_governorate_name`: string, `p_markaz_name`: string, `p_notes`: string, `p_phone`: string, `p_vehicle_plate`: string, `p_vehicle_type`: string | `void` |

---

## 4. قائمة الجداول والأعمدة المكتشفة

### جدول: `admin_audit_logs`
- **العمليات المدعومة:** `GET`, `POST`, `DELETE`, `PATCH`

| اسم العمود | النوع (Type) | التنسيق (Format) | إلزامي (Required) | القيمة الافتراضية |
| :--- | :--- | :--- | :--- | :--- |
| **`id`** | `string` | `uuid` | نعم (مطلوب) | `gen_random_uuid()` |
| **`admin_id`** | `string` | `uuid` | نعم (مطلوب) | — |
| **`action`** | `string` | `text` | نعم (مطلوب) | — |
| **`entity_type`** | `string` | `text` | نعم (مطلوب) | — |
| **`entity_id`** | `string` | `text` | اختياري | — |
| **`details`** | `unknown` | `jsonb` | اختياري | — |
| **`ip_address`** | `string` | `text` | اختياري | — |
| **`created_at`** | `string` | `timestamp with time zone` | نعم (مطلوب) | `now()` |

### جدول: `admin_notification_views`
- **العمليات المدعومة:** `GET`, `POST`, `DELETE`, `PATCH`

| اسم العمود | النوع (Type) | التنسيق (Format) | إلزامي (Required) | القيمة الافتراضية |
| :--- | :--- | :--- | :--- | :--- |
| **`id`** | `string` | `uuid` | نعم (مطلوب) | `gen_random_uuid()` |
| **`notification_id`** | `string` | `uuid` | نعم (مطلوب) | — |
| **`household_id`** | `string` | `text` | اختياري | — |
| **`user_id`** | `string` | `uuid` | اختياري | — |
| **`device_role`** | `string` | `text` | اختياري | `all` |
| **`display_count`** | `integer` | `integer` | نعم (مطلوب) | `1` |
| **`last_displayed_at`** | `string` | `timestamp with time zone` | نعم (مطلوب) | `now()` |
| **`dismissed_at`** | `string` | `timestamp with time zone` | اختياري | — |
| **`created_at`** | `string` | `timestamp with time zone` | اختياري | `now()` |

### جدول: `admin_notifications`
- **العمليات المدعومة:** `GET`, `POST`, `DELETE`, `PATCH`

| اسم العمود | النوع (Type) | التنسيق (Format) | إلزامي (Required) | القيمة الافتراضية |
| :--- | :--- | :--- | :--- | :--- |
| **`id`** | `string` | `uuid` | نعم (مطلوب) | `gen_random_uuid()` |
| **`title`** | `string` | `text` | اختياري | — |
| **`body`** | `string` | `text` | نعم (مطلوب) | — |
| **`type`** | `string` | `text` | نعم (مطلوب) | — |
| **`image_url`** | `string` | `text` | اختياري | — |
| **`icon_name`** | `string` | `text` | اختياري | `Bell` |
| **`action_type`** | `string` | `text` | اختياري | `internal_route` |
| **`action_route`** | `string` | `text` | اختياري | — |
| **`target_scope`** | `string` | `text` | نعم (مطلوب) | `all` |
| **`target_value`** | `string` | `text` | اختياري | — |
| **`max_display_count`** | `integer` | `integer` | نعم (مطلوب) | `3` |
| **`start_at`** | `string` | `timestamp with time zone` | نعم (مطلوب) | `now()` |
| **`end_at`** | `string` | `timestamp with time zone` | اختياري | — |
| **`is_active`** | `boolean` | `boolean` | نعم (مطلوب) | `true` |
| **`created_by`** | `string` | `uuid` | اختياري | — |
| **`created_at`** | `string` | `timestamp with time zone` | اختياري | `now()` |
| **`updated_at`** | `string` | `timestamp with time zone` | اختياري | `now()` |

### جدول: `admin_users`
- **العمليات المدعومة:** `GET`, `POST`, `DELETE`, `PATCH`

| اسم العمود | النوع (Type) | التنسيق (Format) | إلزامي (Required) | القيمة الافتراضية |
| :--- | :--- | :--- | :--- | :--- |
| **`id`** | `string` | `uuid` | نعم (مطلوب) | `gen_random_uuid()` |
| **`user_id`** | `string` | `uuid` | نعم (مطلوب) | — |
| **`email`** | `string` | `text` | نعم (مطلوب) | — |
| **`full_name`** | `string` | `text` | اختياري | — |
| **`role`** | `string` | `text` | نعم (مطلوب) | `ADMIN` |
| **`custom_permissions`** | `unknown` | `jsonb` | اختياري | — |
| **`is_active`** | `boolean` | `boolean` | نعم (مطلوب) | `true` |
| **`created_at`** | `string` | `timestamp with time zone` | نعم (مطلوب) | `timezone('utc'::text, now())` |
| **`updated_at`** | `string` | `timestamp with time zone` | نعم (مطلوب) | `timezone('utc'::text, now())` |

### جدول: `app_asset_uploads`
- **العمليات المدعومة:** `GET`, `POST`, `DELETE`, `PATCH`

| اسم العمود | النوع (Type) | التنسيق (Format) | إلزامي (Required) | القيمة الافتراضية |
| :--- | :--- | :--- | :--- | :--- |
| **`id`** | `string` | `uuid` | نعم (مطلوب) | `gen_random_uuid()` |
| **`app_key`** | `string` | `text` | نعم (مطلوب) | — |
| **`asset_type`** | `string` | `text` | نعم (مطلوب) | — |
| **`storage_bucket`** | `string` | `text` | نعم (مطلوب) | `app-assets` |
| **`storage_path`** | `string` | `text` | نعم (مطلوب) | — |
| **`public_url`** | `string` | `text` | نعم (مطلوب) | — |
| **`original_filename`** | `string` | `text` | اختياري | — |
| **`mime_type`** | `string` | `text` | اختياري | — |
| **`file_size_bytes`** | `integer` | `bigint` | اختياري | — |
| **`width`** | `integer` | `integer` | اختياري | — |
| **`height`** | `integer` | `integer` | اختياري | — |
| **`is_current`** | `boolean` | `boolean` | نعم (مطلوب) | `false` |
| **`uploaded_by`** | `string` | `uuid` | اختياري | — |
| **`created_at`** | `string` | `timestamp with time zone` | نعم (مطلوب) | `now()` |

### جدول: `app_assets`
- **العمليات المدعومة:** `GET`, `POST`, `DELETE`, `PATCH`

| اسم العمود | النوع (Type) | التنسيق (Format) | إلزامي (Required) | القيمة الافتراضية |
| :--- | :--- | :--- | :--- | :--- |
| **`id`** | `string` | `uuid` | نعم (مطلوب) | `gen_random_uuid()` |
| **`app_key`** | `string` | `text` | نعم (مطلوب) | — |
| **`asset_type`** | `string` | `text` | نعم (مطلوب) | — |
| **`upload_id`** | `string` | `uuid` | اختياري | — |
| **`version`** | `integer` | `bigint` | نعم (مطلوب) | `1` |
| **`is_active`** | `boolean` | `boolean` | نعم (مطلوب) | `true` |
| **`updated_by`** | `string` | `uuid` | اختياري | — |
| **`updated_at`** | `string` | `timestamp with time zone` | نعم (مطلوب) | `now()` |

### جدول: `broadcast_notifications`
- **العمليات المدعومة:** `GET`, `POST`, `DELETE`, `PATCH`

| اسم العمود | النوع (Type) | التنسيق (Format) | إلزامي (Required) | القيمة الافتراضية |
| :--- | :--- | :--- | :--- | :--- |
| **`id`** | `string` | `uuid` | نعم (مطلوب) | `gen_random_uuid()` |
| **`sender_id`** | `string` | `uuid` | نعم (مطلوب) | — |
| **`title`** | `string` | `text` | نعم (مطلوب) | — |
| **`body`** | `string` | `text` | نعم (مطلوب) | — |
| **`target_type`** | `string` | `text` | نعم (مطلوب) | `all` |
| **`target_role`** | `string` | `text` | اختياري | — |
| **`target_id`** | `string` | `text` | اختياري | — |
| **`priority`** | `string` | `text` | نعم (مطلوب) | `info` |
| **`sent_at`** | `string` | `timestamp with time zone` | نعم (مطلوب) | `timezone('utc'::text, now())` |

### جدول: `categories`
- **العمليات المدعومة:** `GET`, `POST`, `DELETE`, `PATCH`

| اسم العمود | النوع (Type) | التنسيق (Format) | إلزامي (Required) | القيمة الافتراضية |
| :--- | :--- | :--- | :--- | :--- |
| **`id`** | `string` | `text` | نعم (مطلوب) | — |
| **`household_id`** | `string` | `text` | نعم (مطلوب) | — |
| **`name_ar`** | `string` | `text` | نعم (مطلوب) | — |
| **`name_en`** | `string` | `text` | نعم (مطلوب) | — |
| **`image_url`** | `string` | `text` | نعم (مطلوب) | — |
| **`color`** | `string` | `text` | اختياري | — |
| **`bg_light`** | `string` | `text` | اختياري | — |
| **`badge_color`** | `string` | `text` | اختياري | — |
| **`description`** | `string` | `text` | اختياري | — |
| **`common_items`** | `unknown` | `jsonb` | اختياري | — |
| **`is_custom`** | `boolean` | `boolean` | اختياري | `false` |
| **`created_at`** | `string` | `timestamp with time zone` | اختياري | `now()` |
| **`source_global_category_id`** | `string` | `text` | اختياري | — |
| **`is_active`** | `boolean` | `boolean` | نعم (مطلوب) | `true` |
| **`sort_order`** | `integer` | `integer` | نعم (مطلوب) | `0` |
| **`updated_at`** | `string` | `timestamp with time zone` | اختياري | `now()` |

### جدول: `delivery_drivers`
- **العمليات المدعومة:** `GET`, `POST`, `DELETE`, `PATCH`

| اسم العمود | النوع (Type) | التنسيق (Format) | إلزامي (Required) | القيمة الافتراضية |
| :--- | :--- | :--- | :--- | :--- |
| **`id`** | `string` | `uuid` | نعم (مطلوب) | `gen_random_uuid()` |
| **`user_id`** | `string` | `uuid` | اختياري | — |
| **`full_name`** | `string` | `text` | نعم (مطلوب) | — |
| **`phone`** | `string` | `text` | نعم (مطلوب) | — |
| **`is_active`** | `boolean` | `boolean` | نعم (مطلوب) | `true` |
| **`vehicle_type`** | `string` | `text` | اختياري | `motorcycle` |
| **`notes`** | `string` | `text` | اختياري | — |
| **`created_at`** | `string` | `timestamp with time zone` | نعم (مطلوب) | `timezone('utc'::text, now())` |
| **`updated_at`** | `string` | `timestamp with time zone` | نعم (مطلوب) | `timezone('utc'::text, now())` |
| **`role`** | `string` | `text` | اختياري | `delivery_driver` |
| **`status`** | `string` | `text` | نعم (مطلوب) | `pending_approval` |
| **`governorate_name`** | `string` | `text` | اختياري | — |
| **`governorate_code`** | `string` | `text` | اختياري | — |
| **`markaz_name`** | `string` | `text` | اختياري | — |
| **`vehicle_plate`** | `string` | `text` | اختياري | — |
| **`national_id`** | `string` | `text` | اختياري | — |
| **`approved_at`** | `string` | `timestamp with time zone` | اختياري | — |
| **`approved_by`** | `string` | `uuid` | اختياري | — |
| **`rejected_at`** | `string` | `timestamp with time zone` | اختياري | — |
| **`rejected_by`** | `string` | `uuid` | اختياري | — |
| **`rejection_reason`** | `string` | `text` | اختياري | — |
| **`id_card_front_path`** | `string` | `text` | اختياري | — |
| **`id_card_back_path`** | `string` | `text` | اختياري | — |
| **`driver_license_path`** | `string` | `text` | اختياري | — |
| **`vehicle_license_path`** | `string` | `text` | اختياري | — |

### جدول: `delivery_governorate_settings`
- **العمليات المدعومة:** `GET`, `POST`, `DELETE`, `PATCH`

| اسم العمود | النوع (Type) | التنسيق (Format) | إلزامي (Required) | القيمة الافتراضية |
| :--- | :--- | :--- | :--- | :--- |
| **`id`** | `string` | `uuid` | نعم (مطلوب) | `gen_random_uuid()` |
| **`governorate_code`** | `string` | `text` | نعم (مطلوب) | — |
| **`governorate_name`** | `string` | `text` | نعم (مطلوب) | — |
| **`is_active`** | `boolean` | `boolean` | نعم (مطلوب) | `true` |
| **`delivery_fee`** | `number` | `numeric` | نعم (مطلوب) | `15` |
| **`estimated_delivery_time`** | `string` | `text` | اختياري | — |
| **`notes`** | `string` | `text` | اختياري | — |
| **`created_at`** | `string` | `timestamp with time zone` | نعم (مطلوب) | `timezone('utc'::text, now())` |
| **`updated_at`** | `string` | `timestamp with time zone` | نعم (مطلوب) | `timezone('utc'::text, now())` |

### جدول: `delivery_order_items`
- **العمليات المدعومة:** `GET`, `POST`, `DELETE`, `PATCH`

| اسم العمود | النوع (Type) | التنسيق (Format) | إلزامي (Required) | القيمة الافتراضية |
| :--- | :--- | :--- | :--- | :--- |
| **`id`** | `string` | `uuid` | نعم (مطلوب) | `gen_random_uuid()` |
| **`order_id`** | `string` | `uuid` | نعم (مطلوب) | — |
| **`product_id`** | `string` | `text` | اختياري | — |
| **`product_name`** | `string` | `text` | نعم (مطلوب) | — |
| **`category_id`** | `string` | `text` | اختياري | — |
| **`category_name`** | `string` | `text` | اختياري | — |
| **`quantity`** | `string` | `text` | نعم (مطلوب) | `١` |
| **`unit_price`** | `number` | `numeric` | نعم (مطلوب) | `0` |
| **`total_price`** | `number` | `numeric` | نعم (مطلوب) | `0` |
| **`created_at`** | `string` | `timestamp with time zone` | نعم (مطلوب) | `timezone('utc'::text, now())` |
| **`item_status`** | `string` | `text` | نعم (مطلوب) | `pending` |
| **`actual_unit_price`** | `number` | `numeric` | نعم (مطلوب) | `0` |
| **`actual_total_price`** | `number` | `numeric` | نعم (مطلوب) | `0` |
| **`missing_reason`** | `string` | `text` | اختياري | — |
| **`updated_at`** | `string` | `timestamp with time zone` | نعم (مطلوب) | `timezone('utc'::text, now())` |

### جدول: `delivery_order_status_history`
- **العمليات المدعومة:** `GET`, `POST`, `DELETE`, `PATCH`

| اسم العمود | النوع (Type) | التنسيق (Format) | إلزامي (Required) | القيمة الافتراضية |
| :--- | :--- | :--- | :--- | :--- |
| **`id`** | `string` | `uuid` | نعم (مطلوب) | `gen_random_uuid()` |
| **`order_id`** | `string` | `uuid` | نعم (مطلوب) | — |
| **`old_status`** | `string` | `text` | اختياري | — |
| **`new_status`** | `string` | `text` | نعم (مطلوب) | — |
| **`changed_by`** | `string` | `text` | اختياري | — |
| **`note`** | `string` | `text` | اختياري | — |
| **`created_at`** | `string` | `timestamp with time zone` | نعم (مطلوب) | `timezone('utc'::text, now())` |
| **`previous_status`** | `string` | `public.delivery_order_status` | اختياري | — |
| **`changed_by_role`** | `string` | `text` | اختياري | `delivery_driver` |
| **`notes`** | `string` | `text` | اختياري | — |

### جدول: `delivery_orders`
- **العمليات المدعومة:** `GET`, `POST`, `DELETE`, `PATCH`

| اسم العمود | النوع (Type) | التنسيق (Format) | إلزامي (Required) | القيمة الافتراضية |
| :--- | :--- | :--- | :--- | :--- |
| **`id`** | `string` | `uuid` | نعم (مطلوب) | `gen_random_uuid()` |
| **`household_id`** | `string` | `text` | نعم (مطلوب) | — |
| **`invoice_id`** | `string` | `text` | اختياري | — |
| **`address_id`** | `string` | `uuid` | اختياري | — |
| **`customer_name`** | `string` | `text` | نعم (مطلوب) | — |
| **`customer_phone`** | `string` | `text` | نعم (مطلوب) | — |
| **`country`** | `string` | `text` | نعم (مطلوب) | `مصر` |
| **`governorate_name`** | `string` | `text` | نعم (مطلوب) | — |
| **`markaz_name`** | `string` | `text` | نعم (مطلوب) | — |
| **`detailed_address`** | `string` | `text` | نعم (مطلوب) | — |
| **`subtotal`** | `number` | `numeric` | نعم (مطلوب) | `0` |
| **`delivery_fee`** | `number` | `numeric` | نعم (مطلوب) | `15` |
| **`total_amount`** | `number` | `numeric` | نعم (مطلوب) | `0` |
| **`delivery_notes`** | `string` | `text` | اختياري | — |
| **`assigned_driver_id`** | `string` | `uuid` | اختياري | — |
| **`status`** | `string` | `text` | نعم (مطلوب) | `pending_review` |
| **`cancellation_reason`** | `string` | `text` | اختياري | — |
| **`cancellation_requested_at`** | `string` | `timestamp with time zone` | اختياري | — |
| **`cancellation_decision_note`** | `string` | `text` | اختياري | — |
| **`cancellation_decided_at`** | `string` | `timestamp with time zone` | اختياري | — |
| **`created_at`** | `string` | `timestamp with time zone` | نعم (مطلوب) | `timezone('utc'::text, now())` |
| **`updated_at`** | `string` | `timestamp with time zone` | نعم (مطلوب) | `timezone('utc'::text, now())` |
| **`order_number`** | `string` | `text` | اختياري | — |
| **`household_name`** | `string` | `text` | اختياري | — |
| **`phone_number`** | `string` | `text` | اختياري | — |
| **`governorate`** | `string` | `text` | اختياري | — |
| **`center`** | `string` | `text` | اختياري | — |
| **`items_total`** | `number` | `numeric` | اختياري | `0` |
| **`notes`** | `string` | `text` | اختياري | — |
| **`accepted_at`** | `string` | `timestamp with time zone` | اختياري | — |
| **`delivered_at`** | `string` | `timestamp with time zone` | اختياري | — |
| **`cancellation_requested_by`** | `string` | `uuid` | اختياري | — |
| **`user_id`** | `string` | `uuid` | اختياري | — |
| **`source_recurring_request_id`** | `string` | `uuid` | اختياري | — |
| **`actual_items_total`** | `number` | `numeric` | نعم (مطلوب) | `0` |
| **`actual_total_amount`** | `number` | `numeric` | نعم (مطلوب) | `0` |

### جدول: `delivery_settings`
- **العمليات المدعومة:** `GET`, `POST`, `DELETE`, `PATCH`

| اسم العمود | النوع (Type) | التنسيق (Format) | إلزامي (Required) | القيمة الافتراضية |
| :--- | :--- | :--- | :--- | :--- |
| **`id`** | `string` | `text` | نعم (مطلوب) | `default` |
| **`delivery_enabled`** | `boolean` | `boolean` | نعم (مطلوب) | `true` |
| **`default_delivery_fee`** | `number` | `numeric` | نعم (مطلوب) | `15` |
| **`created_at`** | `string` | `timestamp with time zone` | نعم (مطلوب) | `timezone('utc'::text, now())` |
| **`updated_at`** | `string` | `timestamp with time zone` | نعم (مطلوب) | `timezone('utc'::text, now())` |

### جدول: `global_categories`
- **العمليات المدعومة:** `GET`, `POST`, `DELETE`, `PATCH`

| اسم العمود | النوع (Type) | التنسيق (Format) | إلزامي (Required) | القيمة الافتراضية |
| :--- | :--- | :--- | :--- | :--- |
| **`id`** | `string` | `text` | نعم (مطلوب) | — |
| **`name_ar`** | `string` | `text` | نعم (مطلوب) | — |
| **`name_en`** | `string` | `text` | اختياري | — |
| **`image_url`** | `string` | `text` | نعم (مطلوب) | — |
| **`icon_name`** | `string` | `text` | اختياري | `ShoppingCart` |
| **`color`** | `string` | `text` | اختياري | `emerald` |
| **`bg_light`** | `string` | `text` | اختياري | — |
| **`badge_color`** | `string` | `text` | اختياري | — |
| **`description`** | `string` | `text` | اختياري | — |
| **`subcategories`** | `unknown` | `jsonb` | اختياري | — |
| **`is_active`** | `boolean` | `boolean` | نعم (مطلوب) | `true` |
| **`sort_order`** | `integer` | `integer` | نعم (مطلوب) | `0` |
| **`created_at`** | `string` | `timestamp with time zone` | اختياري | `now()` |
| **`updated_at`** | `string` | `timestamp with time zone` | اختياري | `now()` |

### جدول: `global_products`
- **العمليات المدعومة:** `GET`, `POST`, `DELETE`, `PATCH`

| اسم العمود | النوع (Type) | التنسيق (Format) | إلزامي (Required) | القيمة الافتراضية |
| :--- | :--- | :--- | :--- | :--- |
| **`id`** | `string` | `text` | نعم (مطلوب) | — |
| **`global_category_id`** | `string` | `text` | نعم (مطلوب) | — |
| **`subcategory_id`** | `string` | `text` | اختياري | — |
| **`name_ar`** | `string` | `text` | نعم (مطلوب) | — |
| **`name_en`** | `string` | `text` | اختياري | — |
| **`image_url`** | `string` | `text` | اختياري | — |
| **`default_quantity`** | `string` | `text` | اختياري | `١` |
| **`default_unit`** | `string` | `text` | اختياري | `قطعة` |
| **`estimated_price`** | `number` | `numeric` | اختياري | `0` |
| **`is_active`** | `boolean` | `boolean` | نعم (مطلوب) | `true` |
| **`sort_order`** | `integer` | `integer` | نعم (مطلوب) | `0` |
| **`created_at`** | `string` | `timestamp with time zone` | اختياري | `now()` |
| **`updated_at`** | `string` | `timestamp with time zone` | اختياري | `now()` |

### جدول: `household_addresses`
- **العمليات المدعومة:** `GET`, `POST`, `DELETE`, `PATCH`

| اسم العمود | النوع (Type) | التنسيق (Format) | إلزامي (Required) | القيمة الافتراضية |
| :--- | :--- | :--- | :--- | :--- |
| **`id`** | `string` | `uuid` | نعم (مطلوب) | `gen_random_uuid()` |
| **`household_id`** | `string` | `text` | نعم (مطلوب) | — |
| **`address_label`** | `string` | `text` | نعم (مطلوب) | `المنزل الرئيسي` |
| **`full_name`** | `string` | `text` | نعم (مطلوب) | — |
| **`phone`** | `string` | `text` | نعم (مطلوب) | — |
| **`country`** | `string` | `text` | نعم (مطلوب) | `مصر` |
| **`governorate_code`** | `string` | `text` | اختياري | — |
| **`governorate_name`** | `string` | `text` | نعم (مطلوب) | — |
| **`markaz_code`** | `string` | `text` | اختياري | — |
| **`markaz_name`** | `string` | `text` | نعم (مطلوب) | — |
| **`detailed_address`** | `string` | `text` | نعم (مطلوب) | — |
| **`is_default`** | `boolean` | `boolean` | نعم (مطلوب) | `false` |
| **`created_at`** | `string` | `timestamp with time zone` | نعم (مطلوب) | `timezone('utc'::text, now())` |
| **`updated_at`** | `string` | `timestamp with time zone` | نعم (مطلوب) | `timezone('utc'::text, now())` |

### جدول: `household_budgets`
- **العمليات المدعومة:** `GET`, `POST`, `DELETE`, `PATCH`

| اسم العمود | النوع (Type) | التنسيق (Format) | إلزامي (Required) | القيمة الافتراضية |
| :--- | :--- | :--- | :--- | :--- |
| **`household_id`** | `string` | `text` | نعم (مطلوب) | — |
| **`monthly_limit`** | `number` | `numeric` | اختياري | `2500` |
| **`currency`** | `string` | `text` | اختياري | `ر.س` |
| **`month`** | `string` | `text` | اختياري | `الشهر الحالي` |
| **`updated_at`** | `string` | `timestamp with time zone` | اختياري | `now()` |

### جدول: `household_members`
- **العمليات المدعومة:** `GET`, `POST`, `DELETE`, `PATCH`

| اسم العمود | النوع (Type) | التنسيق (Format) | إلزامي (Required) | القيمة الافتراضية |
| :--- | :--- | :--- | :--- | :--- |
| **`id`** | `string` | `uuid` | نعم (مطلوب) | `gen_random_uuid()` |
| **`household_id`** | `string` | `text` | نعم (مطلوب) | — |
| **`user_id`** | `string` | `uuid` | نعم (مطلوب) | — |
| **`role`** | `string` | `text` | نعم (مطلوب) | `home` |
| **`user_name`** | `string` | `text` | اختياري | — |
| **`user_phone`** | `string` | `text` | اختياري | — |
| **`joined_at`** | `string` | `timestamp with time zone` | اختياري | `now()` |

### جدول: `household_permissions`
- **العمليات المدعومة:** `GET`, `POST`, `DELETE`, `PATCH`

| اسم العمود | النوع (Type) | التنسيق (Format) | إلزامي (Required) | القيمة الافتراضية |
| :--- | :--- | :--- | :--- | :--- |
| **`household_id`** | `string` | `text` | نعم (مطلوب) | — |
| **`allowed_screens`** | `unknown` | `jsonb` | اختياري | — |
| **`can_add_missing_item`** | `boolean` | `boolean` | اختياري | `true` |
| **`can_delete_missing_item`** | `boolean` | `boolean` | اختياري | `false` |
| **`can_edit_item`** | `boolean` | `boolean` | اختياري | `true` |
| **`can_add_invoice`** | `boolean` | `boolean` | اختياري | `false` |
| **`can_use_ai_assistant`** | `boolean` | `boolean` | اختياري | `true` |
| **`can_send_urgent_alert`** | `boolean` | `boolean` | اختياري | `true` |
| **`updated_at`** | `string` | `timestamp with time zone` | اختياري | `now()` |

### جدول: `household_products`
- **العمليات المدعومة:** `GET`, `POST`, `DELETE`, `PATCH`

| اسم العمود | النوع (Type) | التنسيق (Format) | إلزامي (Required) | القيمة الافتراضية |
| :--- | :--- | :--- | :--- | :--- |
| **`id`** | `string` | `text` | نعم (مطلوب) | — |
| **`household_id`** | `string` | `text` | نعم (مطلوب) | — |
| **`category_id`** | `string` | `text` | نعم (مطلوب) | — |
| **`subcategory_id`** | `string` | `text` | اختياري | — |
| **`name_ar`** | `string` | `text` | نعم (مطلوب) | — |
| **`name_en`** | `string` | `text` | اختياري | — |
| **`image_url`** | `string` | `text` | اختياري | — |
| **`quantity`** | `string` | `text` | اختياري | `١` |
| **`unit`** | `string` | `text` | اختياري | `قطعة` |
| **`estimated_price`** | `number` | `numeric` | اختياري | `0` |
| **`source_global_product_id`** | `string` | `text` | اختياري | — |
| **`is_custom`** | `boolean` | `boolean` | اختياري | `false` |
| **`is_active`** | `boolean` | `boolean` | اختياري | `true` |
| **`sort_order`** | `integer` | `integer` | اختياري | `0` |
| **`created_at`** | `string` | `timestamp with time zone` | اختياري | `now()` |
| **`updated_at`** | `string` | `timestamp with time zone` | اختياري | `now()` |

### جدول: `households`
- **العمليات المدعومة:** `GET`, `POST`, `DELETE`, `PATCH`

| اسم العمود | النوع (Type) | التنسيق (Format) | إلزامي (Required) | القيمة الافتراضية |
| :--- | :--- | :--- | :--- | :--- |
| **`id`** | `string` | `text` | نعم (مطلوب) | — |
| **`name`** | `string` | `text` | نعم (مطلوب) | — |
| **`admin_id`** | `string` | `uuid` | اختياري | — |
| **`admin_name`** | `string` | `text` | اختياري | — |
| **`admin_phone`** | `string` | `text` | اختياري | — |
| **`pair_code`** | `string` | `text` | اختياري | — |
| **`created_at`** | `string` | `timestamp with time zone` | اختياري | `now()` |
| **`updated_at`** | `string` | `timestamp with time zone` | اختياري | `now()` |

### جدول: `invoices`
- **العمليات المدعومة:** `GET`, `POST`, `DELETE`, `PATCH`

| اسم العمود | النوع (Type) | التنسيق (Format) | إلزامي (Required) | القيمة الافتراضية |
| :--- | :--- | :--- | :--- | :--- |
| **`id`** | `string` | `text` | نعم (مطلوب) | — |
| **`household_id`** | `string` | `text` | نعم (مطلوب) | — |
| **`invoice_number`** | `string` | `text` | نعم (مطلوب) | — |
| **`date`** | `string` | `text` | نعم (مطلوب) | — |
| **`category`** | `string` | `text` | نعم (مطلوب) | — |
| **`category_arabic`** | `string` | `text` | نعم (مطلوب) | — |
| **`products`** | `unknown` | `jsonb` | نعم (مطلوب) | — |
| **`total_price`** | `number` | `numeric` | نعم (مطلوب) | `0` |
| **`notes`** | `string` | `text` | اختياري | — |
| **`registered_by`** | `string` | `text` | نعم (مطلوب) | — |
| **`payment_method`** | `string` | `text` | اختياري | `card` |
| **`created_at`** | `string` | `timestamp with time zone` | اختياري | `now()` |

### جدول: `missing_items`
- **العمليات المدعومة:** `GET`, `POST`, `DELETE`, `PATCH`

| اسم العمود | النوع (Type) | التنسيق (Format) | إلزامي (Required) | القيمة الافتراضية |
| :--- | :--- | :--- | :--- | :--- |
| **`id`** | `string` | `text` | نعم (مطلوب) | — |
| **`household_id`** | `string` | `text` | نعم (مطلوب) | — |
| **`name`** | `string` | `text` | نعم (مطلوب) | — |
| **`category`** | `string` | `text` | نعم (مطلوب) | — |
| **`category_arabic`** | `string` | `text` | نعم (مطلوب) | — |
| **`quantity`** | `string` | `text` | اختياري | `١` |
| **`urgency`** | `string` | `text` | اختياري | `normal` |
| **`notes`** | `string` | `text` | اختياري | — |
| **`added_by`** | `string` | `text` | اختياري | `home` |
| **`added_by_name`** | `string` | `text` | اختياري | — |
| **`completed`** | `boolean` | `boolean` | اختياري | `false` |
| **`added_at`** | `string` | `timestamp with time zone` | اختياري | `now()` |
| **`completed_at`** | `string` | `timestamp with time zone` | اختياري | — |

### جدول: `notifications`
- **العمليات المدعومة:** `GET`, `POST`, `DELETE`, `PATCH`

| اسم العمود | النوع (Type) | التنسيق (Format) | إلزامي (Required) | القيمة الافتراضية |
| :--- | :--- | :--- | :--- | :--- |
| **`id`** | `string` | `text` | نعم (مطلوب) | — |
| **`household_id`** | `string` | `text` | نعم (مطلوب) | — |
| **`title`** | `string` | `text` | نعم (مطلوب) | — |
| **`message`** | `string` | `text` | نعم (مطلوب) | — |
| **`type`** | `string` | `text` | نعم (مطلوب) | — |
| **`target_role`** | `string` | `text` | اختياري | `all` |
| **`read`** | `boolean` | `boolean` | اختياري | `false` |
| **`created_at`** | `string` | `timestamp with time zone` | اختياري | `now()` |

### جدول: `pairing_tokens`
- **العمليات المدعومة:** `GET`, `POST`, `DELETE`, `PATCH`

| اسم العمود | النوع (Type) | التنسيق (Format) | إلزامي (Required) | القيمة الافتراضية |
| :--- | :--- | :--- | :--- | :--- |
| **`id`** | `string` | `uuid` | نعم (مطلوب) | `gen_random_uuid()` |
| **`household_id`** | `string` | `text` | نعم (مطلوب) | — |
| **`token`** | `string` | `text` | نعم (مطلوب) | — |
| **`created_by`** | `string` | `uuid` | اختياري | — |
| **`created_at`** | `string` | `timestamp with time zone` | اختياري | `now()` |
| **`expires_at`** | `string` | `timestamp with time zone` | نعم (مطلوب) | — |
| **`is_used`** | `boolean` | `boolean` | اختياري | `false` |
| **`used_by`** | `string` | `uuid` | اختياري | — |
| **`used_at`** | `string` | `timestamp with time zone` | اختياري | — |

### جدول: `pharmacy_delivery_area_settings`
- **العمليات المدعومة:** `GET`, `POST`, `DELETE`, `PATCH`

| اسم العمود | النوع (Type) | التنسيق (Format) | إلزامي (Required) | القيمة الافتراضية |
| :--- | :--- | :--- | :--- | :--- |
| **`id`** | `string` | `uuid` | نعم (مطلوب) | `gen_random_uuid()` |
| **`governorate_name`** | `string` | `text` | نعم (مطلوب) | — |
| **`governorate_code`** | `string` | `text` | اختياري | — |
| **`center_name`** | `string` | `text` | نعم (مطلوب) | — |
| **`service_enabled`** | `boolean` | `boolean` | نعم (مطلوب) | `true` |
| **`delivery_fee`** | `number` | `numeric` | نعم (مطلوب) | `0` |
| **`updated_at`** | `string` | `timestamp with time zone` | نعم (مطلوب) | `now()` |
| **`updated_by`** | `string` | `uuid` | اختياري | — |

### جدول: `pharmacy_delivery_orders`
- **العمليات المدعومة:** `GET`, `POST`, `DELETE`, `PATCH`

| اسم العمود | النوع (Type) | التنسيق (Format) | إلزامي (Required) | القيمة الافتراضية |
| :--- | :--- | :--- | :--- | :--- |
| **`id`** | `string` | `uuid` | نعم (مطلوب) | `gen_random_uuid()` |
| **`pharmacy_order_id`** | `string` | `uuid` | نعم (مطلوب) | — |
| **`assigned_driver_id`** | `string` | `uuid` | اختياري | — |
| **`assignment_status`** | `string` | `text` | نعم (مطلوب) | `available` |
| **`accepted_at`** | `string` | `timestamp with time zone` | اختياري | — |
| **`shopping_started_at`** | `string` | `timestamp with time zone` | اختياري | — |
| **`delivery_started_at`** | `string` | `timestamp with time zone` | اختياري | — |
| **`completed_at`** | `string` | `timestamp with time zone` | اختياري | — |
| **`cancellation_requested_at`** | `string` | `timestamp with time zone` | اختياري | — |
| **`cancellation_reason`** | `string` | `text` | اختياري | — |
| **`cancellation_decision`** | `string` | `text` | اختياري | — |
| **`customer_contacted_at`** | `string` | `timestamp with time zone` | اختياري | — |
| **`customer_contacted_by`** | `string` | `uuid` | اختياري | — |
| **`cancellation_decided_at`** | `string` | `timestamp with time zone` | اختياري | — |
| **`cancellation_decided_by`** | `string` | `uuid` | اختياري | — |
| **`created_at`** | `string` | `timestamp with time zone` | نعم (مطلوب) | `now()` |
| **`updated_at`** | `string` | `timestamp with time zone` | نعم (مطلوب) | `now()` |

### جدول: `pharmacy_driver_compensation`
- **العمليات المدعومة:** `GET`, `POST`, `DELETE`, `PATCH`

| اسم العمود | النوع (Type) | التنسيق (Format) | إلزامي (Required) | القيمة الافتراضية |
| :--- | :--- | :--- | :--- | :--- |
| **`id`** | `string` | `uuid` | نعم (مطلوب) | `gen_random_uuid()` |
| **`order_id`** | `string` | `uuid` | نعم (مطلوب) | — |
| **`driver_id`** | `string` | `uuid` | اختياري | — |
| **`entitlement_status`** | `string` | `text` | نعم (مطلوب) | `pending_review` |
| **`entitlement_amount`** | `number` | `numeric` | نعم (مطلوب) | `0` |
| **`decision_note`** | `string` | `text` | اختياري | — |
| **`decided_by`** | `string` | `uuid` | اختياري | — |
| **`decided_at`** | `string` | `timestamp with time zone` | اختياري | — |
| **`settled_at`** | `string` | `timestamp with time zone` | اختياري | — |
| **`created_at`** | `string` | `timestamp with time zone` | نعم (مطلوب) | `now()` |
| **`updated_at`** | `string` | `timestamp with time zone` | نعم (مطلوب) | `now()` |

### جدول: `pharmacy_order_change_log`
- **العمليات المدعومة:** `GET`, `POST`, `DELETE`, `PATCH`

| اسم العمود | النوع (Type) | التنسيق (Format) | إلزامي (Required) | القيمة الافتراضية |
| :--- | :--- | :--- | :--- | :--- |
| **`id`** | `string` | `uuid` | نعم (مطلوب) | `gen_random_uuid()` |
| **`order_id`** | `string` | `uuid` | نعم (مطلوب) | — |
| **`changed_by`** | `string` | `uuid` | اختياري | — |
| **`changed_by_role`** | `string` | `text` | نعم (مطلوب) | — |
| **`change_type`** | `string` | `text` | نعم (مطلوب) | — |
| **`before_data`** | `unknown` | `jsonb` | اختياري | — |
| **`after_data`** | `unknown` | `jsonb` | اختياري | — |
| **`note`** | `string` | `text` | اختياري | — |
| **`created_at`** | `string` | `timestamp with time zone` | نعم (مطلوب) | `now()` |

### جدول: `pharmacy_order_files`
- **العمليات المدعومة:** `GET`, `POST`, `DELETE`, `PATCH`

| اسم العمود | النوع (Type) | التنسيق (Format) | إلزامي (Required) | القيمة الافتراضية |
| :--- | :--- | :--- | :--- | :--- |
| **`id`** | `string` | `uuid` | نعم (مطلوب) | `gen_random_uuid()` |
| **`order_id`** | `string` | `uuid` | نعم (مطلوب) | — |
| **`file_type`** | `string` | `text` | نعم (مطلوب) | — |
| **`storage_path`** | `string` | `text` | نعم (مطلوب) | — |
| **`display_order`** | `integer` | `smallint` | اختياري | — |
| **`mime_type`** | `string` | `text` | اختياري | — |
| **`driver_note`** | `string` | `text` | اختياري | — |
| **`note_updated_at`** | `string` | `timestamp with time zone` | اختياري | — |
| **`note_updated_by`** | `string` | `uuid` | اختياري | — |
| **`source_saved_file_id`** | `string` | `uuid` | اختياري | — |
| **`created_at`** | `string` | `timestamp with time zone` | نعم (مطلوب) | `now()` |

### جدول: `pharmacy_order_items`
- **العمليات المدعومة:** `GET`, `POST`, `DELETE`, `PATCH`

| اسم العمود | النوع (Type) | التنسيق (Format) | إلزامي (Required) | القيمة الافتراضية |
| :--- | :--- | :--- | :--- | :--- |
| **`id`** | `string` | `uuid` | نعم (مطلوب) | `gen_random_uuid()` |
| **`order_id`** | `string` | `uuid` | نعم (مطلوب) | — |
| **`item_name`** | `string` | `text` | نعم (مطلوب) | — |
| **`unit`** | `string` | `text` | نعم (مطلوب) | — |
| **`requested_quantity`** | `number` | `numeric` | نعم (مطلوب) | — |
| **`purchased_quantity`** | `number` | `numeric` | نعم (مطلوب) | `0` |
| **`shortage_quantity`** | `number` | `numeric` | نعم (مطلوب) | `0` |
| **`driver_status`** | `string` | `text` | نعم (مطلوب) | `pending` |
| **`shortage_reason`** | `string` | `text` | اختياري | — |
| **`driver_note`** | `string` | `text` | اختياري | — |
| **`sort_order`** | `integer` | `integer` | نعم (مطلوب) | `0` |
| **`created_at`** | `string` | `timestamp with time zone` | نعم (مطلوب) | `now()` |
| **`updated_at`** | `string` | `timestamp with time zone` | نعم (مطلوب) | `now()` |

### جدول: `pharmacy_order_pharmacy_stops`
- **العمليات المدعومة:** `GET`, `POST`, `DELETE`, `PATCH`

| اسم العمود | النوع (Type) | التنسيق (Format) | إلزامي (Required) | القيمة الافتراضية |
| :--- | :--- | :--- | :--- | :--- |
| **`id`** | `string` | `uuid` | نعم (مطلوب) | `gen_random_uuid()` |
| **`order_id`** | `string` | `uuid` | نعم (مطلوب) | — |
| **`pharmacy_id`** | `string` | `uuid` | اختياري | — |
| **`pharmacy_name`** | `string` | `text` | نعم (مطلوب) | — |
| **`pharmacy_phone`** | `string` | `text` | اختياري | — |
| **`governorate_name`** | `string` | `text` | اختياري | — |
| **`governorate_code`** | `string` | `text` | اختياري | — |
| **`center_name`** | `string` | `text` | اختياري | — |
| **`address`** | `string` | `text` | اختياري | — |
| **`latitude`** | `number` | `numeric` | اختياري | — |
| **`longitude`** | `number` | `numeric` | اختياري | — |
| **`visit_sequence`** | `integer` | `integer` | نعم (مطلوب) | — |
| **`stop_status`** | `string` | `text` | نعم (مطلوب) | `visited` |
| **`internal_note`** | `string` | `text` | اختياري | — |
| **`visited_at`** | `string` | `timestamp with time zone` | نعم (مطلوب) | `now()` |
| **`created_at`** | `string` | `timestamp with time zone` | نعم (مطلوب) | `now()` |

### جدول: `pharmacy_order_status_history`
- **العمليات المدعومة:** `GET`, `POST`, `DELETE`, `PATCH`

| اسم العمود | النوع (Type) | التنسيق (Format) | إلزامي (Required) | القيمة الافتراضية |
| :--- | :--- | :--- | :--- | :--- |
| **`id`** | `string` | `uuid` | نعم (مطلوب) | `gen_random_uuid()` |
| **`order_id`** | `string` | `uuid` | نعم (مطلوب) | — |
| **`from_status`** | `string` | `text` | اختياري | — |
| **`to_status`** | `string` | `text` | نعم (مطلوب) | — |
| **`changed_by`** | `string` | `uuid` | اختياري | — |
| **`changed_by_role`** | `string` | `text` | نعم (مطلوب) | `system` |
| **`note`** | `string` | `text` | اختياري | — |
| **`created_at`** | `string` | `timestamp with time zone` | نعم (مطلوب) | `now()` |

### جدول: `pharmacy_orders`
- **العمليات المدعومة:** `GET`, `POST`, `DELETE`, `PATCH`

| اسم العمود | النوع (Type) | التنسيق (Format) | إلزامي (Required) | القيمة الافتراضية |
| :--- | :--- | :--- | :--- | :--- |
| **`id`** | `string` | `uuid` | نعم (مطلوب) | `gen_random_uuid()` |
| **`order_number`** | `string` | `text` | نعم (مطلوب) | `public.pharmacy_generate_order_number()` |
| **`user_id`** | `string` | `uuid` | نعم (مطلوب) | — |
| **`household_id`** | `string` | `text` | اختياري | — |
| **`saved_prescription_id`** | `string` | `uuid` | اختياري | — |
| **`prescription_title`** | `string` | `text` | نعم (مطلوب) | — |
| **`requested_pharmacy_id`** | `string` | `uuid` | اختياري | — |
| **`requested_pharmacy_name`** | `string` | `text` | اختياري | — |
| **`pharmacy_selection_mode`** | `string` | `text` | نعم (مطلوب) | `user_selected` |
| **`status`** | `string` | `text` | نعم (مطلوب) | `pending_review` |
| **`source_address_id`** | `string` | `uuid` | اختياري | — |
| **`address_governorate_name`** | `string` | `text` | نعم (مطلوب) | — |
| **`address_governorate_code`** | `string` | `text` | اختياري | — |
| **`address_center_name`** | `string` | `text` | نعم (مطلوب) | — |
| **`address_text`** | `string` | `text` | نعم (مطلوب) | — |
| **`address_latitude`** | `number` | `numeric` | اختياري | — |
| **`address_longitude`** | `number` | `numeric` | اختياري | — |
| **`customer_notes`** | `string` | `text` | اختياري | — |
| **`medicines_total`** | `number` | `numeric` | اختياري | — |
| **`delivery_fee`** | `number` | `numeric` | نعم (مطلوب) | — |
| **`grand_total`** | `number` | `numeric` | اختياري | — |
| **`accepted_at`** | `string` | `timestamp with time zone` | اختياري | — |
| **`shopping_started_at`** | `string` | `timestamp with time zone` | اختياري | — |
| **`ready_for_delivery_at`** | `string` | `timestamp with time zone` | اختياري | — |
| **`completed_at`** | `string` | `timestamp with time zone` | اختياري | — |
| **`cancelled_at`** | `string` | `timestamp with time zone` | اختياري | — |
| **`unable_to_fulfill_at`** | `string` | `timestamp with time zone` | اختياري | — |
| **`archived_at`** | `string` | `timestamp with time zone` | اختياري | — |
| **`created_at`** | `string` | `timestamp with time zone` | نعم (مطلوب) | `now()` |
| **`updated_at`** | `string` | `timestamp with time zone` | نعم (مطلوب) | `now()` |

### جدول: `pharmacy_pharmacies`
- **العمليات المدعومة:** `GET`, `POST`, `DELETE`, `PATCH`

| اسم العمود | النوع (Type) | التنسيق (Format) | إلزامي (Required) | القيمة الافتراضية |
| :--- | :--- | :--- | :--- | :--- |
| **`id`** | `string` | `uuid` | نعم (مطلوب) | `gen_random_uuid()` |
| **`name`** | `string` | `text` | نعم (مطلوب) | — |
| **`phone`** | `string` | `text` | اختياري | — |
| **`governorate_name`** | `string` | `text` | نعم (مطلوب) | — |
| **`governorate_code`** | `string` | `text` | اختياري | — |
| **`center_name`** | `string` | `text` | نعم (مطلوب) | — |
| **`address`** | `string` | `text` | نعم (مطلوب) | — |
| **`latitude`** | `number` | `numeric` | اختياري | — |
| **`longitude`** | `number` | `numeric` | اختياري | — |
| **`is_active`** | `boolean` | `boolean` | نعم (مطلوب) | `true` |
| **`created_at`** | `string` | `timestamp with time zone` | نعم (مطلوب) | `now()` |
| **`updated_at`** | `string` | `timestamp with time zone` | نعم (مطلوب) | `now()` |
| **`created_by`** | `string` | `uuid` | اختياري | — |
| **`updated_by`** | `string` | `uuid` | اختياري | — |

### جدول: `pharmacy_saved_prescription_files`
- **العمليات المدعومة:** `GET`, `POST`, `DELETE`, `PATCH`

| اسم العمود | النوع (Type) | التنسيق (Format) | إلزامي (Required) | القيمة الافتراضية |
| :--- | :--- | :--- | :--- | :--- |
| **`id`** | `string` | `uuid` | نعم (مطلوب) | `gen_random_uuid()` |
| **`prescription_id`** | `string` | `uuid` | نعم (مطلوب) | — |
| **`storage_path`** | `string` | `text` | نعم (مطلوب) | — |
| **`display_order`** | `integer` | `smallint` | نعم (مطلوب) | — |
| **`mime_type`** | `string` | `text` | اختياري | — |
| **`created_at`** | `string` | `timestamp with time zone` | نعم (مطلوب) | `now()` |

### جدول: `pharmacy_saved_prescription_items`
- **العمليات المدعومة:** `GET`, `POST`, `DELETE`, `PATCH`

| اسم العمود | النوع (Type) | التنسيق (Format) | إلزامي (Required) | القيمة الافتراضية |
| :--- | :--- | :--- | :--- | :--- |
| **`id`** | `string` | `uuid` | نعم (مطلوب) | `gen_random_uuid()` |
| **`prescription_id`** | `string` | `uuid` | نعم (مطلوب) | — |
| **`item_name`** | `string` | `text` | نعم (مطلوب) | — |
| **`requested_quantity`** | `number` | `numeric` | نعم (مطلوب) | `1` |
| **`unit`** | `string` | `text` | نعم (مطلوب) | — |
| **`sort_order`** | `integer` | `integer` | نعم (مطلوب) | `0` |
| **`created_at`** | `string` | `timestamp with time zone` | نعم (مطلوب) | `now()` |
| **`updated_at`** | `string` | `timestamp with time zone` | نعم (مطلوب) | `now()` |

### جدول: `pharmacy_saved_prescriptions`
- **العمليات المدعومة:** `GET`, `POST`, `DELETE`, `PATCH`

| اسم العمود | النوع (Type) | التنسيق (Format) | إلزامي (Required) | القيمة الافتراضية |
| :--- | :--- | :--- | :--- | :--- |
| **`id`** | `string` | `uuid` | نعم (مطلوب) | `gen_random_uuid()` |
| **`user_id`** | `string` | `uuid` | نعم (مطلوب) | — |
| **`title`** | `string` | `text` | نعم (مطلوب) | — |
| **`pharmacy_id`** | `string` | `uuid` | اختياري | — |
| **`pharmacy_name`** | `string` | `text` | اختياري | — |
| **`last_completed_order_at`** | `string` | `timestamp with time zone` | اختياري | — |
| **`is_deleted`** | `boolean` | `boolean` | نعم (مطلوب) | `false` |
| **`created_at`** | `string` | `timestamp with time zone` | نعم (مطلوب) | `now()` |
| **`updated_at`** | `string` | `timestamp with time zone` | نعم (مطلوب) | `now()` |

### جدول: `pharmacy_settings`
- **العمليات المدعومة:** `GET`, `POST`, `DELETE`, `PATCH`

| اسم العمود | النوع (Type) | التنسيق (Format) | إلزامي (Required) | القيمة الافتراضية |
| :--- | :--- | :--- | :--- | :--- |
| **`id`** | `string` | `uuid` | نعم (مطلوب) | `gen_random_uuid()` |
| **`service_enabled`** | `boolean` | `boolean` | نعم (مطلوب) | `true` |
| **`section_visible`** | `boolean` | `boolean` | نعم (مطلوب) | `true` |
| **`updated_at`** | `string` | `timestamp with time zone` | نعم (مطلوب) | `now()` |
| **`updated_by`** | `string` | `uuid` | اختياري | — |
| **`display_width`** | `string` | `text` | نعم (مطلوب) | `full` |

### جدول: `pharmacy_shortage_reason_suggestions`
- **العمليات المدعومة:** `GET`, `POST`, `DELETE`, `PATCH`

| اسم العمود | النوع (Type) | التنسيق (Format) | إلزامي (Required) | القيمة الافتراضية |
| :--- | :--- | :--- | :--- | :--- |
| **`id`** | `string` | `uuid` | نعم (مطلوب) | `gen_random_uuid()` |
| **`text_value`** | `string` | `text` | نعم (مطلوب) | — |
| **`sort_order`** | `integer` | `integer` | نعم (مطلوب) | `0` |
| **`is_active`** | `boolean` | `boolean` | نعم (مطلوب) | `true` |
| **`created_at`** | `string` | `timestamp with time zone` | نعم (مطلوب) | `now()` |

### جدول: `pharmacy_user_pharmacies`
- **العمليات المدعومة:** `GET`, `POST`, `DELETE`, `PATCH`

| اسم العمود | النوع (Type) | التنسيق (Format) | إلزامي (Required) | القيمة الافتراضية |
| :--- | :--- | :--- | :--- | :--- |
| **`id`** | `string` | `uuid` | نعم (مطلوب) | `gen_random_uuid()` |
| **`user_id`** | `string` | `uuid` | نعم (مطلوب) | — |
| **`pharmacy_id`** | `string` | `uuid` | اختياري | — |
| **`pharmacy_name`** | `string` | `text` | نعم (مطلوب) | — |
| **`phone`** | `string` | `text` | اختياري | — |
| **`governorate_name`** | `string` | `text` | اختياري | — |
| **`governorate_code`** | `string` | `text` | اختياري | — |
| **`center_name`** | `string` | `text` | اختياري | — |
| **`address`** | `string` | `text` | اختياري | — |
| **`latitude`** | `number` | `numeric` | اختياري | — |
| **`longitude`** | `number` | `numeric` | اختياري | — |
| **`use_count`** | `integer` | `integer` | نعم (مطلوب) | `1` |
| **`last_used_at`** | `string` | `timestamp with time zone` | نعم (مطلوب) | `now()` |
| **`created_at`** | `string` | `timestamp with time zone` | نعم (مطلوب) | `now()` |
| **`updated_at`** | `string` | `timestamp with time zone` | نعم (مطلوب) | `now()` |

### جدول: `profiles`
- **العمليات المدعومة:** `GET`, `POST`, `DELETE`, `PATCH`

| اسم العمود | النوع (Type) | التنسيق (Format) | إلزامي (Required) | القيمة الافتراضية |
| :--- | :--- | :--- | :--- | :--- |
| **`id`** | `string` | `uuid` | نعم (مطلوب) | — |
| **`email`** | `string` | `text` | اختياري | — |
| **`full_name`** | `string` | `text` | اختياري | — |
| **`phone`** | `string` | `text` | اختياري | — |
| **`avatar_url`** | `string` | `text` | اختياري | — |
| **`created_at`** | `string` | `timestamp with time zone` | اختياري | `now()` |
| **`updated_at`** | `string` | `timestamp with time zone` | اختياري | `now()` |
| **`is_blocked`** | `boolean` | `boolean` | نعم (مطلوب) | `false` |
| **`status`** | `string` | `text` | نعم (مطلوب) | `active` |
| **`blocked_reason`** | `string` | `text` | اختياري | — |
| **`blocked_at`** | `string` | `timestamp with time zone` | اختياري | — |
| **`blocked_by`** | `string` | `uuid` | اختياري | — |

### جدول: `recurring_order_items`
- **العمليات المدعومة:** `GET`, `POST`, `DELETE`, `PATCH`

| اسم العمود | النوع (Type) | التنسيق (Format) | إلزامي (Required) | القيمة الافتراضية |
| :--- | :--- | :--- | :--- | :--- |
| **`id`** | `string` | `uuid` | نعم (مطلوب) | `gen_random_uuid()` |
| **`recurring_order_id`** | `string` | `uuid` | نعم (مطلوب) | — |
| **`product_id`** | `string` | `text` | اختياري | — |
| **`product_name`** | `string` | `text` | نعم (مطلوب) | — |
| **`category_id`** | `string` | `text` | اختياري | — |
| **`category_name`** | `string` | `text` | اختياري | — |
| **`quantity`** | `string` | `text` | نعم (مطلوب) | `١` |
| **`unit`** | `string` | `text` | نعم (مطلوب) | `قطعة` |
| **`estimated_price`** | `number` | `numeric` | اختياري | `0` |
| **`sort_order`** | `integer` | `integer` | اختياري | `0` |
| **`created_at`** | `string` | `timestamp with time zone` | اختياري | `now()` |

### جدول: `recurring_order_request_items`
- **العمليات المدعومة:** `GET`, `POST`, `DELETE`, `PATCH`

| اسم العمود | النوع (Type) | التنسيق (Format) | إلزامي (Required) | القيمة الافتراضية |
| :--- | :--- | :--- | :--- | :--- |
| **`id`** | `string` | `uuid` | نعم (مطلوب) | `gen_random_uuid()` |
| **`request_id`** | `string` | `uuid` | نعم (مطلوب) | — |
| **`product_id`** | `string` | `text` | اختياري | — |
| **`product_name`** | `string` | `text` | نعم (مطلوب) | — |
| **`category_id`** | `string` | `text` | اختياري | — |
| **`category_name`** | `string` | `text` | اختياري | — |
| **`quantity`** | `string` | `text` | نعم (مطلوب) | `١` |
| **`unit`** | `string` | `text` | نعم (مطلوب) | `قطعة` |
| **`unit_price`** | `number` | `numeric` | نعم (مطلوب) | `0` |
| **`total_price`** | `number` | `numeric` | نعم (مطلوب) | `0` |
| **`is_modified`** | `boolean` | `boolean` | نعم (مطلوب) | `false` |
| **`created_at`** | `string` | `timestamp with time zone` | اختياري | `now()` |

### جدول: `recurring_order_requests`
- **العمليات المدعومة:** `GET`, `POST`, `DELETE`, `PATCH`

| اسم العمود | النوع (Type) | التنسيق (Format) | إلزامي (Required) | القيمة الافتراضية |
| :--- | :--- | :--- | :--- | :--- |
| **`id`** | `string` | `uuid` | نعم (مطلوب) | `gen_random_uuid()` |
| **`household_id`** | `string` | `text` | نعم (مطلوب) | — |
| **`recurring_order_id`** | `string` | `uuid` | اختياري | — |
| **`created_by`** | `string` | `uuid` | اختياري | — |
| **`reviewed_by`** | `string` | `uuid` | اختياري | — |
| **`created_by_role`** | `string` | `text` | نعم (مطلوب) | `home` |
| **`status`** | `string` | `text` | نعم (مطلوب) | `submitted` |
| **`notes`** | `string` | `text` | اختياري | — |
| **`review_notes`** | `string` | `text` | اختياري | — |
| **`delivery_order_id`** | `string` | `uuid` | اختياري | — |
| **`created_at`** | `string` | `timestamp with time zone` | اختياري | `now()` |
| **`updated_at`** | `string` | `timestamp with time zone` | اختياري | `now()` |
| **`reviewed_at`** | `string` | `timestamp with time zone` | اختياري | — |

### جدول: `recurring_orders`
- **العمليات المدعومة:** `GET`, `POST`, `DELETE`, `PATCH`

| اسم العمود | النوع (Type) | التنسيق (Format) | إلزامي (Required) | القيمة الافتراضية |
| :--- | :--- | :--- | :--- | :--- |
| **`id`** | `string` | `uuid` | نعم (مطلوب) | — |
| **`household_id`** | `string` | `text` | نعم (مطلوب) | — |
| **`created_by`** | `string` | `uuid` | نعم (مطلوب) | — |
| **`name`** | `string` | `text` | نعم (مطلوب) | — |
| **`schedule_type`** | `string` | `text` | نعم (مطلوب) | — |
| **`schedule_config`** | `unknown` | `jsonb` | اختياري | — |
| **`is_active`** | `boolean` | `boolean` | نعم (مطلوب) | `true` |
| **`next_run_at`** | `string` | `timestamp with time zone` | اختياري | — |
| **`last_run_at`** | `string` | `timestamp with time zone` | اختياري | — |
| **`created_at`** | `string` | `timestamp with time zone` | اختياري | `now()` |
| **`updated_at`** | `string` | `timestamp with time zone` | اختياري | `now()` |

### جدول: `system_settings`
- **العمليات المدعومة:** `GET`, `POST`, `DELETE`, `PATCH`

| اسم العمود | النوع (Type) | التنسيق (Format) | إلزامي (Required) | القيمة الافتراضية |
| :--- | :--- | :--- | :--- | :--- |
| **`key`** | `string` | `text` | نعم (مطلوب) | — |
| **`value`** | `unknown` | `jsonb` | نعم (مطلوب) | — |
| **`updated_at`** | `string` | `timestamp with time zone` | نعم (مطلوب) | `timezone('utc'::text, now())` |
| **`updated_by`** | `string` | `uuid` | اختياري | — |
