create table if not exists intelligence_agent_threads (
    thread_id varchar(120) primary key,
    user_id varchar(120) not null,
    document_group_id varchar(120) not null,
    title varchar(500) not null,
    model_id varchar(120) not null,
    created_at timestamp with time zone not null
);

create index if not exists idx_agent_threads_user_created
    on intelligence_agent_threads (user_id, created_at desc, thread_id desc);

create table if not exists intelligence_agent_messages (
    message_id varchar(120) primary key,
    thread_id varchar(120) not null,
    user_id varchar(120) not null,
    role varchar(20) not null,
    content text not null,
    model_id varchar(120),
    client_context text not null default '{}',
    created_at timestamp with time zone not null,
    constraint fk_agent_messages_thread
        foreign key (thread_id) references intelligence_agent_threads(thread_id)
        on delete cascade
);

create index if not exists idx_agent_messages_user_thread_created
    on intelligence_agent_messages (user_id, thread_id, created_at asc, message_id asc);

create table if not exists intelligence_agent_actions (
    action_id varchar(120) primary key,
    user_id varchar(120) not null,
    thread_id varchar(120) not null,
    message_id varchar(120) not null,
    action_type varchar(40) not null,
    status varchar(40) not null,
    title varchar(500) not null,
    summary varchar(1000) not null,
    preview_markdown text not null,
    document_group_id varchar(120) not null,
    target_json text not null default '{}',
    payload_json text not null default '{}',
    result_json text,
    error_json text,
    created_at timestamp with time zone not null,
    decided_at timestamp with time zone,
    executed_at timestamp with time zone,
    constraint fk_agent_actions_thread
        foreign key (thread_id) references intelligence_agent_threads(thread_id)
        on delete cascade,
    constraint fk_agent_actions_message
        foreign key (message_id) references intelligence_agent_messages(message_id)
        on delete cascade
);

create index if not exists idx_agent_actions_user_thread_created
    on intelligence_agent_actions (user_id, thread_id, created_at asc, action_id asc);

create index if not exists idx_agent_actions_user_status_created
    on intelligence_agent_actions (user_id, status, created_at desc, action_id desc);
