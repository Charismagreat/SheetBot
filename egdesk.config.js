"use strict";
/**
 * EGDesk User Data Configuration
 * Generated at: 2026-05-28T01:34:49.960Z
 *
 * This file contains type-safe definitions for your EGDesk tables.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.TABLE_NAMES = exports.MAIN_TABLE = exports.TABLES = exports.EGDESK_CONFIG = void 0;
exports.getTableByName = getTableByName;
exports.EGDESK_CONFIG = {
    apiUrl: 'http://localhost:8080',
    apiKey: 'a67ddc0f-7e2b-4997-9a0b-9667a74c89d0',
};
exports.TABLES = {
    table1: {
        name: 'inventory_logs',
        displayName: '재고 변동 이력',
        rowCount: 0,
        columnCount: 10,
        columns: ['id', 'itemId', 'itemName', 'itemType', 'changeType', 'quantity', 'price', 'operator', 'note', 'createdAt']
    },
    table2: {
        name: 'alert_logs',
        displayName: '가격 알림 발송 로그',
        rowCount: 0,
        columnCount: 7,
        columns: ['id', 'log_id', 'rule_id', 'sent_price', 'sent_message', 'sent_at', 'api_response']
    },
    table3: {
        name: 'alert_rules',
        displayName: '가격 알림 규칙',
        rowCount: 1,
        columnCount: 9,
        columns: ['id', 'rule_id', 'item_id', 'rule_name', 'condition_type', 'threshold_value', 'phone_number', 'sms_template', 'is_enabled']
    },
    table4: {
        name: 'price_histories',
        displayName: '수집 가격 이력',
        rowCount: 10,
        columnCount: 7,
        columns: ['id', 'history_id', 'url_id', 'captured_price', 'captured_at', 'status', 'error_message']
    },
    table5: {
        name: 'target_urls',
        displayName: '가격 감시 URL',
        rowCount: 1,
        columnCount: 10,
        columns: ['id', 'url_id', 'item_id', 'site_name', 'target_url', 'css_selector', 'xpath', 'cron_interval', 'is_active', 'created_at']
    },
    table6: {
        name: 'tracked_items',
        displayName: '가격 추적 품목',
        rowCount: 1,
        columnCount: 8,
        columns: ['id', 'item_id', 'item_code', 'item_name', 'category', 'base_price', 'target_margin_rate', 'created_at']
    },
    table7: {
        name: 'ai_token_usage_logs',
        displayName: 'AI 토큰 사용량 로그',
        rowCount: 0,
        columnCount: 7,
        columns: ['id', 'model', 'purpose', 'prompt_tokens', 'completion_tokens', 'total_tokens', 'created_at']
    },
    table8: {
        name: 'inventory_items',
        displayName: '재고 품목',
        rowCount: 0,
        columnCount: 17,
        columns: ['id', 'type', 'name', 'category', 'price', 'partner', 'stock', 'safeStock', 'location', 'spec', 'unitType', 'unitValue', 'boxContains', 'description', 'tags', 'barcode', 'createdAt']
    },
    table9: {
        name: 'crm_partner_contacts',
        displayName: '거래처 담당자 명함첩',
        rowCount: 0,
        columnCount: 9,
        columns: ['id', 'partner_id', 'name', 'position', 'phone', 'email', 'card_image_url', 'is_primary', 'created_at']
    },
    table10: {
        name: 'crm_snaptask_actions',
        displayName: '스냅태스크 AI 액션 감사록',
        rowCount: 0,
        columnCount: 5,
        columns: ['id', 'task_id', 'action_type', 'description', 'created_at']
    },
    table11: {
        name: 'crm_snaptask_items',
        displayName: '스냅태스크 상세 내역',
        rowCount: 0,
        columnCount: 7,
        columns: ['id', 'task_id', 'content_text', 'file_url', 'file_type', 'ai_analysis', 'created_at']
    },
    table12: {
        name: 'crm_snaptasks',
        displayName: '스냅태스크 관리',
        rowCount: 0,
        columnCount: 6,
        columns: ['id', 'title', 'status', 'partner_id', 'created_at', 'updated_at']
    },
    table13: {
        name: 'crm_partners',
        displayName: '거래처 관리',
        rowCount: 0,
        columnCount: 15,
        columns: ['id', 'type', 'company_name', 'business_number', 'representative', 'phone', 'manager_name', 'manager_phone', 'email', 'address', 'vip_level', 'credit_limit', 'business_license_url', 'memo', 'created_at']
    },
    table14: {
        name: 'crm_sales_orders',
        displayName: '수주서 관리',
        rowCount: 0,
        columnCount: 18,
        columns: ['id', 'estimate_id', 'client_order_no', 'customer_name', 'customer_phone', 'customer_manager', 'status', 'total_amount', 'delivery_date', 'order_date', 'created_at', 'uuid', 'updated_at', 'updated_by', 'deleted_at', 'deleted_by', 'restored_at', 'restored_by']
    },
    table15: {
        name: 'crm_purchase_orders',
        displayName: '발주서 관리',
        rowCount: 0,
        columnCount: 8,
        columns: ['id', 'estimate_id', 'vendor_name', 'vendor_phone', 'status', 'total_amount', 'created_at', 'completed_at']
    },
    table16: {
        name: 'crm_estimate_items',
        displayName: '견적서 품목 상세',
        rowCount: 0,
        columnCount: 18,
        columns: ['id', 'estimate_id', 'product_id', 'item_code', 'product_name', 'spec', 'quantity', 'unit_price', 'amount', 'delivery_date', 'valid_item_code', 'uuid', 'updated_at', 'updated_by', 'deleted_at', 'deleted_by', 'restored_at', 'restored_by']
    },
    table17: {
        name: 'crm_estimates',
        displayName: '견적서 관리',
        rowCount: 0,
        columnCount: 21,
        columns: ['id', 'type', 'direction_status', 'partner_name', 'partner_phone', 'partner_manager', 'tags', 'total_amount', 'file_url', 'business_license_url', 'ai_parsed', 'created_at', 'uuid', 'sales_order_number', 'purchase_order_number', 'updated_at', 'updated_by', 'deleted_at', 'deleted_by', 'restored_at', 'restored_by']
    },
    table18: {
        name: 'crm_point_history',
        displayName: '적립금 내역',
        rowCount: 0,
        columnCount: 9,
        columns: ['id', 'customer_id', 'transaction_type', 'amount', 'balance_after', 'description', 'related_entity_type', 'related_entity_id', 'created_at']
    },
    table19: {
        name: 'crm_coupons_restrictions',
        displayName: '쿠폰 제한 관리',
        rowCount: 0,
        columnCount: 6,
        columns: ['id', 'coupon_id', 'restriction_type', 'target_type', 'target_value', 'created_at']
    },
    table20: {
        name: 'coupons',
        displayName: '쿠폰 관리',
        rowCount: 0,
        columnCount: 9,
        columns: ['id', 'code', 'name', 'discount_type', 'discount_value', 'min_order_amount', 'status', 'expires_at', 'created_at']
    },
    table21: {
        name: 'naver_blog_marketing_settings',
        displayName: '네이버 블로그 마케팅 설정',
        rowCount: 1,
        columnCount: 8,
        columns: ['id', 'is_autopilot', 'autopilot_interval', 'autopilot_time', 'tone_style', 'naver_blog_id', 'api_client_id', 'api_client_secret']
    },
    table22: {
        name: 'crm_naver_blog_posts',
        displayName: '네이버 블로그 포스팅 이력 및 예약',
        rowCount: 0,
        columnCount: 13,
        columns: ['id', 'product_id', 'status', 'title', 'content', 'target_keywords', 'image_url', 'sub_image_url', 'scheduled_at', 'posted_at', 'error_message', 'views_count', 'likes_count']
    },
    table23: {
        name: 'instagram_marketing_settings',
        displayName: '인스타그램 마케팅 설정',
        rowCount: 1,
        columnCount: 7,
        columns: ['id', 'is_autopilot', 'autopilot_interval', 'autopilot_time', 'tone_style', 'instagram_username', 'access_token']
    },
    table24: {
        name: 'crm_instagram_posts',
        displayName: '인스타그램 포스팅 이력 및 예약',
        rowCount: 0,
        columnCount: 10,
        columns: ['id', 'product_id', 'status', 'content', 'image_url', 'scheduled_at', 'posted_at', 'error_message', 'likes_count', 'comments_count']
    },
    table25: {
        name: 'crm_operators',
        displayName: '운영자 권한 관리',
        rowCount: 0,
        columnCount: 6,
        columns: ['id', 'username', 'password_hash', 'name', 'role', 'created_at']
    },
    table26: {
        name: 'system_settings',
        displayName: '시스템 설정',
        rowCount: 1,
        columnCount: 3,
        columns: ['id', 'key', 'value']
    },
    table27: {
        name: 'crm_deliveries',
        displayName: '배송 내역',
        rowCount: 0,
        columnCount: 8,
        columns: ['id', 'customer_name', 'customer_phone', 'address', 'courier', 'tracking_number', 'status', 'order_id']
    },
    table28: {
        name: 'crm_reservations',
        displayName: '예약 내역',
        rowCount: 0,
        columnCount: 7,
        columns: ['id', 'customer_name', 'customer_phone', 'service_name', 'reservation_date', 'reservation_time', 'status']
    },
    table29: {
        name: 'crm_payments',
        displayName: '결제 내역',
        rowCount: 0,
        columnCount: 7,
        columns: ['id', 'customer_name', 'payment_method', 'amount', 'payment_date', 'status', 'order_id']
    },
    table30: {
        name: 'crm_orders',
        displayName: '주문 내역',
        rowCount: 0,
        columnCount: 13,
        columns: ['id', 'customer_name', 'customer_phone', 'product_name', 'quantity', 'total_price', 'delivery_method', 'shipping_address', 'tracking_number', 'attachment_url', 'customer_memo', 'order_date', 'status']
    },
    table31: {
        name: 'crm_transactions',
        displayName: '거래 내역',
        rowCount: 0,
        columnCount: 8,
        columns: ['id', 'customer_name', 'customer_phone', 'product_name', 'amount', 'order_date', 'status', 'order_id']
    },
    table32: {
        name: 'products',
        displayName: '광고 상품',
        rowCount: 0,
        columnCount: 12,
        columns: ['id', 'name', 'price', 'url', 'description', 'main_image_url', 'detail_image_url', 'available_methods', 'category', 'menu_category', 'is_coupon_excludable', 'is_estimate_price']
    },
    table33: {
        name: 'ad_templates',
        displayName: '광고 템플릿',
        rowCount: 0,
        columnCount: 5,
        columns: ['id', 'name', 'header', 'footer', 'opt_out']
    },
    table34: {
        name: 'message_logs',
        displayName: '발송 내역',
        rowCount: 0,
        columnCount: 6,
        columns: ['id', 'customer_id', 'phone', 'message', 'status', 'created_at']
    },
    table35: {
        name: 'message_templates',
        displayName: '문자 템플릿',
        rowCount: 0,
        columnCount: 3,
        columns: ['id', 'title', 'content']
    },
    table36: {
        name: 'crm_customers',
        displayName: '고객 명단',
        rowCount: 0,
        columnCount: 11,
        columns: ['id', 'name', 'phone', 'tags', 'memo', 'address', 'shipping_address', 'recipient_name', 'recipient_phone', 'point_balance', 'created_at']
    },
    table37: {
        name: 'exchange_rate_histories',
        displayName: '환율 변동 이력',
        rowCount: 588,
        columnCount: 5,
        columns: ['id', 'history_id', 'currency_code', 'rate_value', 'captured_date']
    },
    table38: {
        name: 'exchange_rates',
        displayName: '실시간 환율',
        rowCount: 4,
        columnCount: 8,
        columns: ['id', 'rate_id', 'currency_code', 'currency_name', 'current_rate', 'change_rate', 'change_direction', 'last_updated_at']
    }
};
// Main table (first table by default)
exports.MAIN_TABLE = exports.TABLES.table1;
// Helper to get table by name
function getTableByName(tableName) {
    return Object.values(exports.TABLES).find(function (t) { return t.name === tableName; });
}
// Export table names for easy access
exports.TABLE_NAMES = {
    table1: 'inventory_logs',
    table2: 'alert_logs',
    table3: 'alert_rules',
    table4: 'price_histories',
    table5: 'target_urls',
    table6: 'tracked_items',
    table7: 'ai_token_usage_logs',
    table8: 'inventory_items',
    table9: 'crm_partner_contacts',
    table10: 'crm_snaptask_actions',
    table11: 'crm_snaptask_items',
    table12: 'crm_snaptasks',
    table13: 'crm_partners',
    table14: 'crm_sales_orders',
    table15: 'crm_purchase_orders',
    table16: 'crm_estimate_items',
    table17: 'crm_estimates',
    table18: 'crm_point_history',
    table19: 'crm_coupons_restrictions',
    table20: 'coupons',
    table21: 'naver_blog_marketing_settings',
    table22: 'crm_naver_blog_posts',
    table23: 'instagram_marketing_settings',
    table24: 'crm_instagram_posts',
    table25: 'crm_operators',
    table26: 'system_settings',
    table27: 'crm_deliveries',
    table28: 'crm_reservations',
    table29: 'crm_payments',
    table30: 'crm_orders',
    table31: 'crm_transactions',
    table32: 'products',
    table33: 'ad_templates',
    table34: 'message_logs',
    table35: 'message_templates',
    table36: 'crm_customers',
    table37: 'exchange_rate_histories',
    table38: 'exchange_rates'
};
