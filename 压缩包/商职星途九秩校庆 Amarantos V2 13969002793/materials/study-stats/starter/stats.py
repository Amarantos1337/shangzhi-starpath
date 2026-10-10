"""起始练习：输入为模拟数据；请替换 TODO 中的累计部分。"""
import csv
from pathlib import Path

source = Path(__file__).with_name('study.csv')
with source.open(encoding='utf-8-sig', newline='') as stream:
    rows = list(csv.DictReader(stream))

# TODO：阅读教程，增加逐行累计的循环。当前程序只显示占位结果。
total = 0
totals = {}

print(f'记录数：{len(rows)}')
print(f'总时长：{total} 分钟')
for subject, minutes in totals.items():
    print(f'{subject}：{minutes} 分钟')
