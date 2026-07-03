delete from ai_models where model_id in (
    'gpt-5.4-mini', 'gpt-5.4-nano',
    'voyage-4-large', 'voyage-4', 'voyage-4-lite', 'voyage-context-3'
);

insert into ai_models (
    model_id, name, provider,
    vendor_input_cost_per_1k_tokens, vendor_cached_input_cost_per_1k_tokens,
    vendor_output_cost_per_1k_tokens, vendor_cost_currency
) values
    ('gpt-5.4-mini', 'GPT-5.4 mini', 'openai', 0.000750, 0.000075, 0.004500, 'USD'),
    ('gpt-5.4-nano', 'GPT-5.4 nano', 'openai', 0.000750, 0.000075, 0.004500, 'USD'),
    ('voyage-4-large', 'Voyage 4 Large', 'voyage', 0.000120, null, null, 'USD'),
    ('voyage-4', 'Voyage 4', 'voyage', 0.000060, null, null, 'USD'),
    ('voyage-4-lite', 'Voyage 4 Lite', 'voyage', 0.000020, null, null, 'USD'),
    ('voyage-context-3', 'Voyage Context 3', 'voyage', 0.000180, null, null, 'USD');
