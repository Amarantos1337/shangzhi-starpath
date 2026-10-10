"""原创参考成品。只读取脚本旁的模拟 CSV，不上传数据。"""
import csv
from pathlib import Path


def summarize(source):
    with source.open(encoding='utf-8-sig', newline='') as stream:
        reader = csv.DictReader(stream)
        if reader.fieldnames != ['date', 'subject', 'minutes']:
            raise ValueError('表头应为 date,subject,minutes')
        rows = list(reader)
    total = 0
    totals = {}
    for line, row in enumerate(rows, start=2):
        subject = (row.get('subject') or '').strip()
        minutes_text = row.get('minutes') or ''
        if not subject or not minutes_text.isascii() or not minutes_text.isdecimal():
            raise ValueError(f'第 {line} 行：科目不能为空，分钟数应为非负整数')
        if None in row or not row.get('date'):
            raise ValueError(f'第 {line} 行：应包含日期、科目、分钟数三个字段')
        minutes = int(minutes_text)
        total += minutes
        totals[subject] = totals.get(subject, 0) + minutes
    return len(rows), total, totals


if __name__ == '__main__':
    try:
        count, total, totals = summarize(Path(__file__).with_name('study.csv'))
    except (OSError, UnicodeError, ValueError) as error:
        print(f'无法统计：{error}')
        raise SystemExit(1)
    print(f'记录数：{count}')
    print(f'总时长：{total} 分钟')
    for subject, minutes in totals.items():
        print(f'{subject}：{minutes} 分钟')
