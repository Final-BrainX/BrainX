update user_style_profiles
set style = (style::jsonb - 'assistanceStyle')::text
where style is not null
  and trim(style) <> ''
  and style::jsonb ? 'assistanceStyle';
